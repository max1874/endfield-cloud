#import <WebKit/WebKit.h>

// Without camera/microphone permission WebKit filters ICE candidates down to a
// single mDNS-obscured host candidate. On a Mac with several interfaces (Wi-Fi
// plus Ethernet, VPN/TUN default routes, VM bridges) that candidate can sit on an
// interface that never sends a connectivity check, and the cloud stream stalls in
// ICE "new" until the SDK times out. Gather real candidates on every interface.
// The game window only ever loads the official cloud page.
void endfield_configure_webrtc(void *rawWebView) {
    NSCAssert(NSThread.isMainThread, @"WKWebView must be configured on its main thread");
    WKWebView *webView = (__bridge WKWebView *)rawWebView;
    WKPreferences *preferences = webView.configuration.preferences;
    // WebKit SPI (WKPreferencesPrivate.h); there is no public equivalent.
    SEL setter = NSSelectorFromString(@"_setICECandidateFilteringEnabled:");
    BOOL supported = [preferences respondsToSelector:setter];
    if (supported) {
        void (*set)(id, SEL, BOOL) = (void (*)(id, SEL, BOOL))[preferences methodForSelector:setter];
        set(preferences, setter, NO);
    }
    fprintf(stderr, "webrtc ice_candidate_filtering_disabled=%d\n", supported);
}
