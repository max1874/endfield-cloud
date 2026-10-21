#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#import <Vision/Vision.h>
#import <objc/runtime.h>

// Native services for the automation engine (native/engine/*.js). The engine runs in
// its own content world: it shares the DOM with the cloud page, so its input events
// reach the SDK, but page scripts cannot see or call it. This bridge gives it OCR,
// evidence storage and logging; it never acts on the game itself.

static char EngineBridgeKey;
static NSString *const EngineWorldName = @"endfield-engine";

static BOOL IsCloudURL(NSURL *url) {
    return [url.scheme isEqualToString:@"https"] &&
        [url.host isEqualToString:@"endfield.hypergryph.com"] &&
        (!url.port || url.port.integerValue == 443) &&
        ([url.path isEqualToString:@"/cloud"] || [url.path hasPrefix:@"/cloud/"]);
}

static NSURL *AutomationRoot(void) {
    NSURL *base = [NSFileManager.defaultManager URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject;
    return [[base URLByAppendingPathComponent:@"local.endfield.cloud.prototype/automation" isDirectory:YES] URLByStandardizingPath];
}

// Resolve an engine-supplied relative path under the automation root, or nil.
static NSURL *ArtifactURL(id path) {
    if (![path isKindOfClass:NSString.class] || [path length] == 0 || [path length] > 300) return nil;
    NSCharacterSet *allowed = [NSCharacterSet characterSetWithCharactersInString:
        @"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_./"];
    if ([path rangeOfCharacterFromSet:allowed.invertedSet].location != NSNotFound) return nil;
    for (NSString *part in [path componentsSeparatedByString:@"/"])
        if (part.length == 0 || [part hasPrefix:@"."]) return nil;
    return [AutomationRoot() URLByAppendingPathComponent:path];
}

static NSData *DecodeImage(id value) {
    if (![value isKindOfClass:NSString.class]) return nil;
    NSString *text = value;
    NSRange comma = [text rangeOfString:@","];
    if ([text hasPrefix:@"data:"] && comma.location != NSNotFound) text = [text substringFromIndex:comma.location + 1];
    NSData *data = [[NSData alloc] initWithBase64EncodedString:text options:0];
    return data.length > 0 && data.length <= 32 * 1024 * 1024 ? data : nil;
}

static NSArray *RecognizeText(NSData *image, BOOL fast, NSError **error) {
    VNRecognizeTextRequest *request = [VNRecognizeTextRequest new];
    request.recognitionLevel = fast ? VNRequestTextRecognitionLevelFast : VNRequestTextRecognitionLevelAccurate;
    request.minimumTextHeight = 0.005;
    request.recognitionLanguages = @[@"zh-Hans", @"en-US"];
    request.usesLanguageCorrection = NO;
    [[[VNImageRequestHandler alloc] initWithData:image options:@{}] performRequests:@[request] error:error];
    NSMutableArray *texts = [NSMutableArray array];
    for (VNRecognizedTextObservation *observation in request.results) {
        VNRecognizedText *text = [observation topCandidates:1].firstObject;
        if (!text) continue;
        CGRect box = observation.boundingBox;
        [texts addObject:@{@"text": text.string, @"confidence": @(text.confidence),
                           @"x": @(box.origin.x), @"y": @(1 - CGRectGetMaxY(box)),
                           @"w": @(box.size.width), @"h": @(box.size.height)}];
    }
    return texts;
}

@interface EndfieldEngineBridge : NSObject <WKScriptMessageHandlerWithReply>
@property(nonatomic, copy) NSString *source;
@end

@implementation EndfieldEngineBridge
- (void)userContentController:(WKUserContentController *)controller
      didReceiveScriptMessage:(WKScriptMessage *)message
                 replyHandler:(void (^)(id, NSString *))reply {
    if (!message.frameInfo.isMainFrame || !IsCloudURL(message.webView.URL) ||
        ![message.body isKindOfClass:NSDictionary.class]) {
        reply(nil, @"rejected");
        return;
    }
    NSDictionary *body = message.body;
    NSString *op = body[@"op"];
    if ([op isEqualToString:@"log"]) {
        NSString *text = [body[@"text"] isKindOfClass:NSString.class] ? body[@"text"] : @"";
        if (text.length > 1000) text = [text substringToIndex:1000];
        fprintf(stderr, "engine %s\n", [text stringByReplacingOccurrencesOfString:@"\n" withString:@" "].UTF8String);
        reply(@YES, nil);
    } else if ([op isEqualToString:@"ocr"]) {
        NSData *image = DecodeImage(body[@"image"]);
        if (!image) { reply(nil, @"bad_image"); return; }
        BOOL fast = [body[@"fast"] boolValue];
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
            NSError *error = nil;
            NSArray *texts = RecognizeText(image, fast, &error);
            dispatch_async(dispatch_get_main_queue(), ^{
                if (error) reply(nil, error.localizedDescription);
                else reply(@{@"texts": texts}, nil);
            });
        });
    } else if ([op isEqualToString:@"save"]) {
        NSURL *url = ArtifactURL(body[@"path"]);
        NSData *data = [body[@"image"] isKindOfClass:NSString.class] ? DecodeImage(body[@"image"])
            : [body[@"text"] isKindOfClass:NSString.class] ? [body[@"text"] dataUsingEncoding:NSUTF8StringEncoding] : nil;
        if (!url || !data) { reply(nil, @"bad_save"); return; }
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
            [NSFileManager.defaultManager createDirectoryAtURL:url.URLByDeletingLastPathComponent
                                   withIntermediateDirectories:YES attributes:nil error:nil];
            BOOL ok = [data writeToURL:url atomically:YES];
            dispatch_async(dispatch_get_main_queue(), ^{ ok ? reply(url.path, nil) : reply(nil, @"write_failed"); });
        });
    } else if ([op isEqualToString:@"status"]) {
        NSString *text = [body[@"text"] isKindOfClass:NSString.class] ? body[@"text"] : @"";
        message.webView.window.title = text.length ? [@"云终末地 · " stringByAppendingString:text] : @"云终末地 · Tauri 原型";
        reply(@YES, nil);
    } else {
        reply(nil, @"unknown_op");
    }
}
@end

void endfield_install_engine(void *rawWebView, const char *source) {
    NSCAssert(NSThread.isMainThread, @"WKWebView must be configured on its main thread");
    WKWebView *webView = (__bridge WKWebView *)rawWebView;
    if (objc_getAssociatedObject(webView, &EngineBridgeKey)) return;
    EndfieldEngineBridge *bridge = [EndfieldEngineBridge new];
    bridge.source = [NSString stringWithUTF8String:source];
    objc_setAssociatedObject(webView, &EngineBridgeKey, bridge, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    WKContentWorld *world = [WKContentWorld worldWithName:EngineWorldName];
    WKUserContentController *controller = webView.configuration.userContentController;
    [controller addScriptMessageHandlerWithReply:bridge contentWorld:world name:@"endfieldEngine"];
    [controller addUserScript:[[WKUserScript alloc] initWithSource:bridge.source
                                                     injectionTime:WKUserScriptInjectionTimeAtDocumentEnd
                                                  forMainFrameOnly:YES inContentWorld:world]];
}

// Run a command in the engine world, injecting the engine first if the current
// document predates the user script.
void endfield_engine_command(void *rawWebView, const char *command) {
    NSCAssert(NSThread.isMainThread, @"WKWebView must be used on its main thread");
    WKWebView *webView = (__bridge WKWebView *)rawWebView;
    EndfieldEngineBridge *bridge = objc_getAssociatedObject(webView, &EngineBridgeKey);
    if (!bridge || !IsCloudURL(webView.URL)) {
        fprintf(stderr, "engine command_rejected\n");
        return;
    }
    WKContentWorld *world = [WKContentWorld worldWithName:EngineWorldName];
    NSString *body = [NSString stringWithUTF8String:command];
    NSString *source = bridge.source;
    [webView evaluateJavaScript:@"typeof window.__engine" inFrame:nil inContentWorld:world completionHandler:^(id type, __unused NSError *error) {
        void (^run)(void) = ^{
            [webView callAsyncJavaScript:body arguments:nil inFrame:nil inContentWorld:world completionHandler:^(__unused id result, NSError *runError) {
                if (runError) fprintf(stderr, "engine command_failed %s\n", runError.localizedDescription.UTF8String);
            }];
        };
        if ([type isEqual:@"object"]) { run(); return; }
        [webView evaluateJavaScript:source inFrame:nil inContentWorld:world completionHandler:^(id _, NSError *injectError) {
            if (injectError) fprintf(stderr, "engine inject_failed %s\n", injectError.localizedDescription.UTF8String);
            else run();
        }];
    }];
}
