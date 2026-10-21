#import <WebKit/WebKit.h>

// Debug builds only: run an async function body in the game page and write its
// result to a file, so input and recognition experiments can be driven from a shell.
// A result that is a PNG data URL is written as an image.
void endfield_dev_eval(void *rawWebView, const char *script, const char *outputPath) {
    NSCAssert(NSThread.isMainThread, @"WKWebView must be used on its main thread");
    WKWebView *webView = (__bridge WKWebView *)rawWebView;
    NSString *body = [NSString stringWithUTF8String:script];
    NSString *output = [NSString stringWithUTF8String:outputPath];
    NSDate *started = [NSDate date];
    // "//native:window" reports the AppKit state WebKit derives page visibility from.
    if ([body hasPrefix:@"//native:window"]) {
        NSWindow *window = webView.window;
        if ([body containsString:@"orderFront"]) [window orderFrontRegardless];
        NSDictionary *state = @{
            @"hasWindow": @(window != nil), @"isVisible": @(window.isVisible), @"isMiniaturized": @(window.isMiniaturized),
            @"occlusionVisible": @((window.occlusionState & NSWindowOcclusionStateVisible) != 0),
            @"onActiveSpace": @(window.isOnActiveSpace), @"viewHidden": @(webView.isHiddenOrHasHiddenAncestor),
            @"appActive": @(NSApp.isActive), @"appHidden": @(NSApp.isHidden),
            @"frame": NSStringFromRect(window.frame), @"windowNumber": @(window.windowNumber)};
        NSData *json = [NSJSONSerialization dataWithJSONObject:state options:NSJSONWritingPrettyPrinted error:nil];
        [json writeToFile:[output stringByAppendingPathExtension:@"json"] atomically:YES];
        return;
    }
    // A script starting with "//world:engine" runs in the engine's isolated world.
    WKContentWorld *world = [body hasPrefix:@"//world:engine"] ? [WKContentWorld worldWithName:@"endfield-engine"]
                                                                : WKContentWorld.pageWorld;
    [webView callAsyncJavaScript:body arguments:nil inFrame:nil inContentWorld:world
               completionHandler:^(id result, NSError *error) {
        double ms = -started.timeIntervalSinceNow * 1000;
        static NSString *const PNGPrefix = @"data:image/png;base64,";
        if (!error && [result isKindOfClass:NSString.class] && [result hasPrefix:PNGPrefix]) {
            NSData *png = [[NSData alloc] initWithBase64EncodedString:[result substringFromIndex:PNGPrefix.length] options:0];
            [png writeToFile:[output stringByAppendingPathExtension:@"png"] atomically:YES];
            fprintf(stderr, "dev %s png bytes=%lu ms=%.0f\n", output.lastPathComponent.UTF8String, (unsigned long)png.length, ms);
            return;
        }
        id value = error ? @{@"error": error.localizedDescription} : (result ?: [NSNull null]);
        NSData *json = [NSJSONSerialization isValidJSONObject:@[value]]
            ? [NSJSONSerialization dataWithJSONObject:@{@"ms": @(ms), @"result": value} options:NSJSONWritingPrettyPrinted error:nil]
            : [[NSString stringWithFormat:@"{\"ms\": %.0f, \"result\": \"%@\"}", ms, value] dataUsingEncoding:NSUTF8StringEncoding];
        [json writeToFile:[output stringByAppendingPathExtension:@"json"] atomically:YES];
        fprintf(stderr, "dev %s %s ms=%.0f\n", output.lastPathComponent.UTF8String, error ? "error" : "ok", ms);
    }];
}
