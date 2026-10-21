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
    [webView callAsyncJavaScript:body arguments:nil inFrame:nil inContentWorld:WKContentWorld.pageWorld
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
