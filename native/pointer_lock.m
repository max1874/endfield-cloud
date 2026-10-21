#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>

static char PointerLockProxyKey;

static BOOL IsCloudURL(NSURL *url) {
    return [url.scheme isEqualToString:@"https"] &&
        [url.host isEqualToString:@"endfield.hypergryph.com"] &&
        (!url.port || url.port.integerValue == 443) &&
        ([url.path isEqualToString:@"/cloud"] || [url.path hasPrefix:@"/cloud/"]);
}

// WKWebView caches optional delegate methods when setUIDelegate: is called.
// A per-view forwarding proxy keeps Wry's login, popup and permission handling.
@interface EndfieldPointerLockDelegate : NSObject <WKUIDelegate, WKScriptMessageHandler>
@property(nonatomic, strong) id<WKUIDelegate> original;
@end

@implementation EndfieldPointerLockDelegate
- (BOOL)respondsToSelector:(SEL)selector {
    return [super respondsToSelector:selector] || [self.original respondsToSelector:selector];
}
- (id)forwardingTargetForSelector:(SEL)selector {
    if ([self.original respondsToSelector:selector]) return self.original;
    return [super forwardingTargetForSelector:selector];
}

// WebKit SPI: the public WKUIDelegate protocol has no pointer-lock decision API.
// Wry 0.57 has no decision handler, so WebKit otherwise denies every request.
// WebKit owns cursor capture, relative motion and release on Escape/focus loss.
- (void)_webViewDidRequestPointerLock:(WKWebView *)webView
                  completionHandler:(void (^)(BOOL))completionHandler {
    BOOL trusted = IsCloudURL(webView.URL);
    BOOL focused = webView.window.isKeyWindow && NSApp.isActive;
    BOOL allowed = trusted && focused;
    fprintf(stderr, "pointer_lock request trusted=%d focused=%d allowed=%d\n", trusted, focused, allowed);
    completionHandler(allowed);
}
- (void)_webViewDidLosePointerLock:(WKWebView *)webView {
    fprintf(stderr, "pointer_lock native_released\n");
}
- (void)userContentController:(WKUserContentController *)controller
     didReceiveScriptMessage:(WKScriptMessage *)message {
    if ([message.name isEqualToString:@"endfieldDiagnostics"]) {
        // diagnostics.js redacts and truncates before posting; cap again here.
        if ([message.body isKindOfClass:NSString.class]) {
            NSString *text = message.body;
            if (text.length > 700) text = [text substringToIndex:700];
            text = [text stringByReplacingOccurrencesOfString:@"\n" withString:@" "];
            fprintf(stderr, "page %s\n", text.UTF8String);
        }
        return;
    }
    if (!message.frameInfo.isMainFrame || !IsCloudURL(message.webView.URL)) return;
    if (![message.body isKindOfClass:NSString.class]) return;
    NSSet *events = [NSSet setWithArray:@[@"locked", @"released", @"error", @"relative_motion", @"sensitivity_1", @"sensitivity_2", @"sensitivity_4", @"sensitivity_8", @"sensitivity_16", @"sensitivity_unavailable", @"bridge_ready"]];
    if ([events containsObject:message.body]) {
        fprintf(stderr, "pointer_lock dom_%s\n", [(NSString *)message.body UTF8String]);
    }
}
@end

void endfield_install_pointer_lock(void *rawWebView) {
    NSCAssert(NSThread.isMainThread, @"WKWebView must be configured on its main thread");
    WKWebView *webView = (__bridge WKWebView *)rawWebView;
    if (objc_getAssociatedObject(webView, &PointerLockProxyKey)) return;
    EndfieldPointerLockDelegate *proxy = [EndfieldPointerLockDelegate new];
    proxy.original = webView.UIDelegate;
    objc_setAssociatedObject(webView, &PointerLockProxyKey, proxy, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    webView.UIDelegate = proxy;
    WKUserContentController *controller = webView.configuration.userContentController;
    [controller addScriptMessageHandler:proxy name:@"endfieldPointerLockEvents"];
    [controller addScriptMessageHandler:proxy name:@"endfieldDiagnostics"];
}
