#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>

static id BackgroundActivity;

// Ignoring occlusion keeps covered windows rendering. A minimized window or hidden
// app still marks the page hidden, throttling timers to 1 s and potentially stopping
// them, so hidden-page timer throttling and process suppression are disabled too.
// The host process also opts out of App Nap to keep the cloud game running.
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
    WKPreferences *preferences = webView.configuration.preferences;
    SEL preferenceSetters[] = {
        NSSelectorFromString(@"_setHiddenPageDOMTimerThrottlingEnabled:"),
        NSSelectorFromString(@"_setHiddenPageDOMTimerThrottlingAutoIncreases:"),
        NSSelectorFromString(@"_setPageVisibilityBasedProcessSuppressionEnabled:"),
    };
    BOOL preferenceSupported[3] = {NO, NO, NO};
    for (size_t i = 0; i < sizeof(preferenceSetters) / sizeof(preferenceSetters[0]); i++) {
        SEL preferenceSetter = preferenceSetters[i];
        preferenceSupported[i] = [preferences respondsToSelector:preferenceSetter];
        if (preferenceSupported[i]) {
            void (*set)(id, SEL, BOOL) = (void (*)(id, SEL, BOOL))[preferences methodForSelector:preferenceSetter];
            set(preferences, preferenceSetter, NO);
        }
    }
    if (!BackgroundActivity) {
        BackgroundActivity = [NSProcessInfo.processInfo
            beginActivityWithOptions:NSActivityUserInitiatedAllowingIdleSystemSleep | NSActivityLatencyCritical
                              reason:@"Cloud game stream"];
    }
    fprintf(stderr, "background occlusion_detection_disabled=%d hidden_timer_throttling_disabled=%d hidden_timer_auto_increases_disabled=%d visibility_process_suppression_disabled=%d app_nap_disabled=1\n",
            supported, preferenceSupported[0], preferenceSupported[1], preferenceSupported[2]);
}
