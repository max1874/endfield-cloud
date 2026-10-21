#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#import <Vision/Vision.h>
#import <objc/runtime.h>

static char AutomationKey;

@interface EndfieldAutomation : NSObject
@property(nonatomic, weak) WKWebView *webView;
@property(nonatomic) NSUInteger generation;
@property(nonatomic) BOOL running;
@property(nonatomic) NSInteger stage;
@property(nonatomic) NSTimeInterval deadline;
@property(nonatomic) double lastVideoTime;
@property(nonatomic) NSURL *directory;
@property(nonatomic) NSMutableArray *records;
@property(nonatomic) NSUInteger frameNumber;
- (void)start;
- (void)stop:(NSString *)reason;
- (void)captureOnly;
@end

@implementation EndfieldAutomation
- (BOOL)trusted {
    NSURL *url = self.webView.URL;
    return [url.scheme isEqualToString:@"https"] && [url.host isEqualToString:@"endfield.hypergryph.com"] &&
        (!url.port || url.port.integerValue == 443) &&
        ([url.path isEqualToString:@"/cloud"] || [url.path hasPrefix:@"/cloud/"]);
}
- (void)record:(NSDictionary *)record {
    [self.records addObject:record];
    NSData *json = [NSJSONSerialization dataWithJSONObject:self.records options:NSJSONWritingPrettyPrinted error:nil];
    [json writeToURL:[self.directory URLByAppendingPathComponent:@"result.json"] atomically:YES];
}
- (void)prepareDirectory {
    NSURL *base = [[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject;
    self.directory = [[[base URLByAppendingPathComponent:@"local.endfield.cloud.prototype/automation"]
        URLByAppendingPathComponent:NSUUID.UUID.UUIDString] URLByStandardizingPath];
    [[NSFileManager defaultManager] createDirectoryAtURL:self.directory withIntermediateDirectories:YES attributes:nil error:nil];
    self.records = [NSMutableArray array];
    self.frameNumber = 0;
    self.lastVideoTime = -1;
    fprintf(stderr, "automation artifacts=%s\n", self.directory.path.UTF8String);
}
- (void)status:(NSString *)text {
    self.webView.window.title = [@"云终末地 · " stringByAppendingString:text];
}
- (void)stop:(NSString *)reason {
    if (!self.running) return;
    self.running = NO;
    self.generation++;
    [self.webView evaluateJavaScript:@"window.__endfieldAutomation?.stop()" completionHandler:nil];
    [self record:@{@"result":reason, @"stage":@(self.stage)}];
    fprintf(stderr, "automation result=%s stage=%ld\n", reason.UTF8String, (long)self.stage);
    NSDictionary *messages = @{
        @"passed": @"设置往返完成",
        @"capture_failed": @"未取得游戏画面，请先进入游戏",
        @"bridge_unavailable": @"页面尚未就绪，请重新加载",
        @"input_failed": @"操作未发送，验证已停止",
        @"focus_lost": @"已切出窗口，验证已停止",
        @"user_interrupted": @"已按 Esc 停止验证",
        @"user_stopped": @"已停止验证",
        @"state_timeout": @"未识别到预期画面，验证已停止"
    };
    [self status:messages[reason] ?: @"验证已停止"];
}
- (void)start {
    if (self.running || ![self trusted]) return;
    [self prepareDirectory];
    self.running = YES;
    self.generation++;
    self.stage = 0;
    self.deadline = NSDate.timeIntervalSinceReferenceDate + 10;
    [self status:@"正在验证设置往返 · Esc 停止"];
    NSUInteger generation = self.generation;
    [self.webView evaluateJavaScript:@"window.__endfieldAutomation.begin()" completionHandler:^(id result, NSError *error) {
        if (generation != self.generation) return;
        if (error || ![result boolValue]) { [self stop:@"bridge_unavailable"]; return; }
        [self schedule:0.4 generation:generation];
    }];
}
- (void)schedule:(double)delay generation:(NSUInteger)generation {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delay * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (self.running && generation == self.generation) [self observe:generation];
    });
}
- (void)readFrame:(void (^)(NSDictionary *, NSArray *, NSError *))completion {
    if (![self trusted]) { completion(nil,nil,[NSError errorWithDomain:@"Automation" code:1 userInfo:nil]); return; }
    [self.webView evaluateJavaScript:@"window.__endfieldAutomation.capture()" completionHandler:^(id value, NSError *error) {
        if (error || ![value isKindOfClass:NSDictionary.class]) { completion(nil,nil,error ?: [NSError errorWithDomain:@"Automation" code:2 userInfo:nil]); return; }
        NSDictionary *frame = value;
        NSData *png = [[NSData alloc] initWithBase64EncodedString:frame[@"png"] options:0];
        if (!png || png.length > 32 * 1024 * 1024) { completion(nil,nil,[NSError errorWithDomain:@"Automation" code:3 userInfo:nil]); return; }
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
            VNRecognizeTextRequest *request = [VNRecognizeTextRequest new];
            request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
            request.minimumTextHeight = 0.005;
            request.recognitionLanguages = @[@"zh-Hans", @"en-US"];
            request.usesLanguageCorrection = NO;
            VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithData:png options:@{}];
            NSError *ocrError = nil;
            [handler performRequests:@[request] error:&ocrError];
            NSMutableArray *texts = [NSMutableArray array];
            for (VNRecognizedTextObservation *observation in request.results) {
                VNRecognizedText *text = [observation topCandidates:1].firstObject;
                if (text && text.confidence >= 0.3) {
                    CGRect box = observation.boundingBox;
                    [texts addObject:@{@"text":text.string, @"confidence":@(text.confidence),
                        @"x":@(box.origin.x), @"y":@(1-CGRectGetMaxY(box)),
                        @"width":@(box.size.width), @"height":@(box.size.height)}];
                }
            }
            dispatch_async(dispatch_get_main_queue(), ^{ completion(frame,texts,ocrError); });
        });
    }];
}
- (BOOL)texts:(NSArray *)texts contain:(NSString *)needle top:(double)top bottom:(double)bottom {
    for (NSDictionary *item in texts) {
        double y = [item[@"y"] doubleValue];
        if (y >= top && y <= bottom && [item[@"text"] containsString:needle]) return YES;
    }
    return NO;
}
- (NSString *)classify:(NSArray *)texts {
    NSUInteger menu = 0, hud = 0;
    for (NSString *word in @[@"干员", @"行动手册", @"好友", @"贵重品库", @"采购中心"])
        menu += [self texts:texts contain:word top:0 bottom:1];

    for (NSString *word in @[@"F7", @"F8", @"F9", @"ESC"])
        hud += [self texts:texts contain:word top:0 bottom:0.12];
    if (menu >= 3) return @"menu";
    if ([self texts:texts contain:@"设置" top:0 bottom:0.1] &&
        [self texts:texts contain:@"性能与画面" top:0.08 bottom:0.2] &&
        [self texts:texts contain:@"队友技能特效" top:0.15 bottom:0.4]) return @"settings";
    if (hud >= 2 && [self texts:texts contain:@"UID" top:0.85 bottom:1]) return @"gameplay";
    return @"unknown";
}
- (void)saveFrame:(NSDictionary *)frame texts:(NSArray *)texts state:(NSString *)state {
    NSString *file = [NSString stringWithFormat:@"%03lu-%@.png", (unsigned long)self.frameNumber++, state];
    NSData *png = [[NSData alloc] initWithBase64EncodedString:frame[@"png"] options:0];
    [png writeToURL:[self.directory URLByAppendingPathComponent:file] atomically:YES];
    [self record:@{@"image":file, @"state":state, @"stage":@(self.stage),
        @"videoTime":frame[@"time"], @"focused":frame[@"focused"], @"texts":texts}];
    fprintf(stderr, "automation observed=%s stage=%ld video_time=%.3f\n", state.UTF8String, (long)self.stage, [frame[@"time"] doubleValue]);
}
- (void)captureOnly {
    if (self.running || ![self trusted]) return;
    [self prepareDirectory];
    NSUInteger generation = ++self.generation;
    // A short delay lets the caller cover the window to verify occluded capture.
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        if (generation != self.generation) return;
        [self readFrame:^(NSDictionary *frame, NSArray *texts, NSError *error) {
            if (generation != self.generation) return;
            if (error) { fprintf(stderr,"automation capture_failed code=%ld\n",(long)error.code); return; }
            [self saveFrame:frame texts:texts state:[self classify:texts]];
            [self status:@"已读取游戏画面"];
        }];
    });
}
- (void)act:(NSString *)script next:(NSInteger)stage generation:(NSUInteger)generation {
    if (![self trusted] || !self.webView.window.isKeyWindow || !NSApp.isActive) { [self stop:@"focus_lost"]; return; }
    self.stage = stage;
    self.deadline = NSDate.timeIntervalSinceReferenceDate + 10;
    [self.webView evaluateJavaScript:script completionHandler:^(id result, NSError *error) {
        if (generation != self.generation) return;
        if (error || ![result boolValue]) { [self stop:@"input_failed"]; return; }
        [self schedule:0.7 generation:generation];
    }];
}
- (void)observe:(NSUInteger)generation {
    if (!self.webView.window.isKeyWindow || !NSApp.isActive) { [self stop:@"focus_lost"]; return; }
    [self readFrame:^(NSDictionary *frame, NSArray *texts, NSError *error) {
        if (generation != self.generation || !self.running) return;
        if (error) { [self stop:@"capture_failed"]; return; }
        if ([frame[@"stopped"] boolValue]) { [self stop:@"user_interrupted"]; return; }
        NSString *state = [self classify:texts];
        [self saveFrame:frame texts:texts state:state];
        double videoTime = [frame[@"time"] doubleValue];
        BOOL fresh = videoTime > self.lastVideoTime;
        self.lastVideoTime = videoTime;
        if (NSDate.timeIntervalSinceReferenceDate > self.deadline) { [self stop:@"state_timeout"]; return; }
        if (!fresh) { [self schedule:0.5 generation:generation]; return; }
        if (self.stage == 0 && [state isEqualToString:@"gameplay"]) {
            [self act:@"window.__endfieldAutomation.escape()" next:1 generation:generation];
        } else if (self.stage == 1 && [state isEqualToString:@"menu"]) {
            // This prototype supports the current PC menu layout only. Never click
            // until the menu's independent text anchors have been observed.
            [self act:@"window.__endfieldAutomation.click(0.172, 0.115)" next:2 generation:generation];
        } else if (self.stage == 2 && [state isEqualToString:@"settings"]) {
            [self act:@"window.__endfieldAutomation.escape()" next:3 generation:generation];
        } else if (self.stage == 3 && [state isEqualToString:@"menu"]) {
            [self act:@"window.__endfieldAutomation.escape()" next:4 generation:generation];
        } else if ((self.stage == 3 || self.stage == 4) && [state isEqualToString:@"gameplay"]) {
            [self stop:@"passed"];
        } else {
            [self schedule:0.5 generation:generation];
        }
    }];
}
@end

void endfield_automation_action(void *rawWebView, int action) {
    NSCAssert(NSThread.isMainThread, @"Automation must run on the main thread");
    WKWebView *webView = (__bridge WKWebView *)rawWebView;
    EndfieldAutomation *controller = objc_getAssociatedObject(webView, &AutomationKey);
    if (!controller) {
        controller = [EndfieldAutomation new];
        controller.webView = webView;
        objc_setAssociatedObject(webView, &AutomationKey, controller, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    if (action == 0) [controller captureOnly];
    else if (action == 1) [controller start];
    else [controller stop:@"user_stopped"];
}
