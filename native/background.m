#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>

static id BackgroundActivity;

// A covered window makes WebKit treat the page as hidden: timers are throttled,
// rendering stops and the cloud stream stalls during startup. The game must keep
// running while the user works in other apps, so the game view ignores occlusion
// and the host process opts out of App Nap.
void endfield_keep_running_when_covered(void *rawWebView) {
    NSCAssert(NSThread.isMainThread, @"WKWebView must be configured on its main thread");
    WKWebView *webView = (__bridge WKWebView *)rawWebView;
    // WebKit SPI (WKWebViewPrivate.h); there is no public equivalent.
    SEL setter = NSSelectorFromString(@"_setWindowOcclusionDetectionEnabled:");
    BOOL supported = [webView respondsToSelector:setter];
    if (supported) {
        void (*set)(id, SEL, BOOL) = (void (*)(id, SEL, BOOL))[webView methodForSelector:setter];
        set(webView, setter, NO);
    }
    if (!BackgroundActivity) {
        BackgroundActivity = [NSProcessInfo.processInfo
            beginActivityWithOptions:NSActivityUserInitiatedAllowingIdleSystemSleep | NSActivityLatencyCritical
                              reason:@"Cloud game stream"];
    }
    fprintf(stderr, "background occlusion_detection_disabled=%d app_nap_disabled=1\n", supported);
}
