#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#import <Vision/Vision.h>
#import <CoreImage/CoreImage.h>
#import <ImageIO/ImageIO.h>
#import <objc/runtime.h>

// Native services for the automation engine (native/engine/*.js). The engine runs in
// its own content world: it shares the DOM with the cloud page, so its input events
// reach the SDK, but page scripts cannot see or call it. This bridge gives it OCR,
// questions to a vision model (model assist, with the user's own key), evidence storage
// (also read back, for state kept across runs) and logging; it never acts on the game
// itself.

extern void endfield_update_install(void);

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

// The user's own DeepSeek key for model assist (core.js), set from 自动化 → 模型兜底.
// It sits beside the automation root, outside any path the engine can save or load.
static NSURL *AssistKeyURL(void) {
    return [AutomationRoot().URLByDeletingLastPathComponent URLByAppendingPathComponent:@"deepseek-key"];
}

static NSString *Trimmed(NSString *text) {
    return [text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
}

static NSString *AssistKey(void) {
    return Trimmed([NSString stringWithContentsOfURL:AssistKeyURL() encoding:NSUTF8StringEncoding error:nil]);
}

static BOOL LooksLikeKey(NSString *key) {
    return key && [key rangeOfString:@"^sk-[A-Za-z0-9]{20,}$" options:NSRegularExpressionSearch].location != NSNotFound;
}

bool endfield_assist_has_key(void) { return AssistKey().length > 0; }

// Refreshes the menu item's label (src/main.rs).
extern void endfield_assist_key_changed(void);

static void ShowNotice(NSString *title, NSString *text) {
    NSAlert *alert = [NSAlert new];
    alert.messageText = title;
    alert.informativeText = text;
    [alert runModal];
}

// Save `key` once DeepSeek accepts it. /user/balance costs nothing and also tells
// whether the account can pay for calls.
static void VerifyAndSave(NSString *key) {
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:@"https://api.deepseek.com/user/balance"]];
    request.timeoutInterval = 15;
    [request setValue:[@"Bearer " stringByAppendingString:key] forHTTPHeaderField:@"Authorization"];
    [[NSURLSession.sharedSession dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        long status = [response isKindOfClass:NSHTTPURLResponse.class] ? ((NSHTTPURLResponse *)response).statusCode : 0;
        id json = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
        if (![json isKindOfClass:NSDictionary.class]) json = nil;
        id balances = json[@"balance_infos"];
        id first = [balances isKindOfClass:NSArray.class] && [balances count] ? balances[0] : nil;
        NSString *balance = [first isKindOfClass:NSDictionary.class] ? [NSString stringWithFormat:@"%@ %@", first[@"total_balance"], first[@"currency"]] : nil;
        BOOL available = [json[@"is_available"] isKindOfClass:NSNumber.class] && [json[@"is_available"] boolValue];
        fprintf(stderr, "assist key_check status=%ld\n", status);
        dispatch_async(dispatch_get_main_queue(), ^{
            if (status == 401 || status == 403) {
                ShowNotice(@"这个 Key 不能用", @"DeepSeek 拒绝了这个 Key，没有保存。请到 platform.deepseek.com → API Keys 重新复制。");
                return;
            }
            [NSFileManager.defaultManager createFileAtPath:AssistKeyURL().path contents:[key dataUsingEncoding:NSUTF8StringEncoding]
                                                attributes:@{NSFilePosixPermissions: @0600}];
            endfield_assist_key_changed();
            if (status != 200) ShowNotice(@"Key 已保存，但没能验证", [NSString stringWithFormat:@"现在连不上 DeepSeek（%@），之后可以用「模型兜底：自检」再确认。",
                                                                    error ? error.localizedDescription : [NSString stringWithFormat:@"HTTP %ld", status]]);
            else if (!available) ShowNotice(@"Key 已保存，但余额不足", [NSString stringWithFormat:@"账户余额 %@，模型协助会失败，充值后即可使用。", balance ?: @"未知"]);
            else ShowNotice(@"Key 已保存", [NSString stringWithFormat:@"已验证可用，账户余额 %@。", balance ?: @"未知"]);
        });
    }] resume];
}

// 自动化 → 模型兜底: a dialog to paste, replace or clear the key.
void endfield_assist_edit_key(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSString *current = AssistKey();
        NSAlert *alert = [NSAlert new];
        alert.messageText = @"模型兜底 · DeepSeek Key";
        alert.informativeText = [NSString stringWithFormat:
            @"Vision 认不出按钮或读不准数字时，用你自己的 DeepSeek Key 请模型帮忙看（只读字、找位置，不替你做选择，费用记在你的 DeepSeek 账户）。\n\n"
            @"在 platform.deepseek.com → API Keys 新建一个 Key，复制后粘贴到下面。\n\n当前：%@",
            current.length ? [NSString stringWithFormat:@"已设置（…%@）", [current substringFromIndex:MAX(0, (NSInteger)current.length - 4)]] : @"未设置"];
        NSSecureTextField *field = [[NSSecureTextField alloc] initWithFrame:NSMakeRect(0, 0, 320, 24)];
        field.placeholderString = @"sk-…";
        NSString *clipboard = Trimmed([NSPasteboard.generalPasteboard stringForType:NSPasteboardTypeString]);
        if (LooksLikeKey(clipboard) && ![clipboard isEqualToString:current]) field.stringValue = clipboard;
        alert.accessoryView = field;
        [alert addButtonWithTitle:@"保存"];
        [alert addButtonWithTitle:@"取消"];
        if (current.length) [alert addButtonWithTitle:@"清除 Key"];
        alert.window.initialFirstResponder = field;
        NSModalResponse response = [alert runModal];
        if (response == NSAlertThirdButtonReturn) {
            [NSFileManager.defaultManager removeItemAtURL:AssistKeyURL() error:nil];
            endfield_assist_key_changed();
        } else if (response == NSAlertFirstButtonReturn) {
            NSString *key = Trimmed(field.stringValue);
            if (LooksLikeKey(key)) VerifyAndSave(key);
            else ShowNotice(@"这不是 DeepSeek Key", @"DeepSeek 的 Key 以 sk- 开头。没有保存。");
        }
    });
}

// One question about one image to DeepSeek's vision model; replies with its answer text.
// Thinking is off: with it on, answers took 1.5-3.5 s and often came as explanations
// (offline eval on our frames, 2026-10-30).
static void AskModel(NSString *image, NSString *question, void (^reply)(id, NSString *)) {
    NSString *key = AssistKey();
    if (!key.length) { reply(nil, @"no_key"); return; }
    NSDictionary *payload = @{@"model": @"deepseek-v4-flash-vision-exp", @"temperature": @0, @"max_tokens": @200,
        @"thinking": @{@"type": @"disabled"},
        @"messages": @[@{@"role": @"user", @"content": @[
            @{@"type": @"image_url", @"image_url": @{@"url": image}}, @{@"type": @"text", @"text": question}]}]};
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:@"https://api.deepseek.com/chat/completions"]];
    request.HTTPMethod = @"POST";
    request.timeoutInterval = 30;
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    [request setValue:[@"Bearer " stringByAppendingString:key] forHTTPHeaderField:@"Authorization"];
    request.HTTPBody = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
    NSDate *start = NSDate.date;
    [[NSURLSession.sharedSession dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        id json = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
        if (![json isKindOfClass:NSDictionary.class]) json = nil;
        id choices = json[@"choices"];
        id first = [choices isKindOfClass:NSArray.class] && [choices count] ? choices[0] : nil;
        id message = [first isKindOfClass:NSDictionary.class] ? first[@"message"] : nil;
        id content = [message isKindOfClass:NSDictionary.class] ? message[@"content"] : nil;
        id usage = json[@"usage"];
        id tokens = [usage isKindOfClass:NSDictionary.class] ? usage[@"total_tokens"] : nil;
        long status = [response isKindOfClass:NSHTTPURLResponse.class] ? ((NSHTTPURLResponse *)response).statusCode : 0;
        fprintf(stderr, "engine llm status=%ld seconds=%.2f tokens=%s\n", status, -start.timeIntervalSinceNow,
                ([tokens description] ?: @"-").UTF8String);
        dispatch_async(dispatch_get_main_queue(), ^{
            if ([content isKindOfClass:NSString.class]) reply(content, nil);
            else reply(nil, error ? error.localizedDescription : [NSString stringWithFormat:@"llm_http_%ld", status]);
        });
    }] resume];
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

// Revision 2 throughout. Revision 3 guesses text orientation: it read a lone "60" as
// upside-down "09", and on some full frames it took the whole screen as rotated
// (7 consecutive looks of a static 地区建设 screen, 2026-10-22). On eight saved game
// frames revision 2 returned every text revision 3 did. `digits` is for small crops
// holding one number (item counts): colored crops often lost single digits, a
// desaturated one got 36 of 36 right.
static NSArray *RecognizeText(NSData *image, BOOL fast, BOOL digits, NSError **error) {
    VNRecognizeTextRequest *request = [VNRecognizeTextRequest new];
    request.revision = VNRecognizeTextRequestRevision2;
    request.recognitionLevel = fast ? VNRequestTextRecognitionLevelFast : VNRequestTextRecognitionLevelAccurate;
    request.minimumTextHeight = 0.005;
    request.recognitionLanguages = @[@"zh-Hans", @"en-US"];
    request.usesLanguageCorrection = NO;
    VNImageRequestHandler *handler;
    if (digits) {
        CIImage *gray = [[CIImage imageWithData:image] imageByApplyingFilter:@"CIColorControls"
                                                         withInputParameters:@{kCIInputSaturationKey: @0}];
        handler = [[VNImageRequestHandler alloc] initWithCIImage:gray options:@{}];
    } else {
        // Decode with ImageIO and hand Vision a CGImage: given the encoded data, macOS 27
        // Vision kept failing every request with CRImageReaderError 1 (runs
        // 20261030-103957-ho5k, 20261030-105454-u72i).
        CGImageSourceRef source = CGImageSourceCreateWithData((__bridge CFDataRef)image, NULL);
        CGImageRef cgImage = source ? CGImageSourceCreateImageAtIndex(source, 0, NULL) : NULL;
        if (source) CFRelease(source);
        if (!cgImage) {
            if (error) *error = [NSError errorWithDomain:@"endfield.ocr" code:1 userInfo:@{NSLocalizedDescriptionKey: @"image_decode_failed"}];
            return @[];
        }
        handler = [[VNImageRequestHandler alloc] initWithCGImage:cgImage options:@{}];
        CGImageRelease(cgImage);
    }
    [handler performRequests:@[request] error:error];
    if (error && *error) {
        fprintf(stderr, "engine ocr_failed bytes=%lu digits=%d %s\n", (unsigned long)image.length, digits, (*error).localizedDescription.UTF8String);
    }
    NSMutableArray *texts = [NSMutableArray array];
    for (VNRecognizedTextObservation *observation in request.results) {
        VNRecognizedText *text = [observation topCandidates:1].firstObject;
        if (!text) continue;
        // Game text is always upright; a rotated reading is a misread (see above).
        if (observation.topLeft.x > observation.bottomRight.x || observation.topLeft.y < observation.bottomRight.y) continue;
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
    if ([op isEqualToString:@"update_install"]) {
        endfield_update_install();
        reply(@YES, nil);
    } else if ([op isEqualToString:@"log"]) {
        NSString *text = [body[@"text"] isKindOfClass:NSString.class] ? body[@"text"] : @"";
        if (text.length > 1000) text = [text substringToIndex:1000];
        fprintf(stderr, "engine %s\n", [text stringByReplacingOccurrencesOfString:@"\n" withString:@" "].UTF8String);
        reply(@YES, nil);
    } else if ([op isEqualToString:@"ocr"]) {
        NSData *image = DecodeImage(body[@"image"]);
        if (!image) { reply(nil, @"bad_image"); return; }
        BOOL fast = [body[@"fast"] boolValue];
        BOOL digits = [body[@"digits"] boolValue];
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
            NSError *error = nil;
            NSArray *texts = RecognizeText(image, fast, digits, &error);
            // Vision now and then fails a request it passes on a second try
            // (CRImageReaderError 1, run 20261030-103957-ho5k).
            if (error) { [NSThread sleepForTimeInterval:0.2]; error = nil; texts = RecognizeText(image, fast, digits, &error); }
            dispatch_async(dispatch_get_main_queue(), ^{
                if (error) reply(nil, error.localizedDescription);
                else reply(@{@"texts": texts}, nil);
            });
        });
    } else if ([op isEqualToString:@"llm"]) {
        NSString *image = body[@"image"], *question = body[@"question"];
        if (![image isKindOfClass:NSString.class] || ![image hasPrefix:@"data:image/"] || image.length > 8 * 1024 * 1024 ||
            ![question isKindOfClass:NSString.class] || question.length > 2000) { reply(nil, @"bad_llm"); return; }
        AskModel(image, question, reply);
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
    } else if ([op isEqualToString:@"load"]) {
        // A text file saved earlier; null when there is none.
        NSURL *url = ArtifactURL(body[@"path"]);
        if (!url) { reply(nil, @"bad_load"); return; }
        NSString *text = [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:nil];
        reply(text ?: NSNull.null, nil);
    } else if ([op isEqualToString:@"status"]) {
        NSString *text = [body[@"text"] isKindOfClass:NSString.class] ? body[@"text"] : @"";
        message.webView.window.title = text.length ? [@"云终末地 · " stringByAppendingString:text] : @"云终末地";
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
