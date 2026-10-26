#import <WebKit/WebKit.h>

// Mutes or unmutes everything the game page plays. The cloud SDK plays game audio
// through its own <audio> element, or a Web Audio context with some decoders, and
// sets the element's volume to 100 at every session start; the page-level state
// covers both paths and stays across sessions. Returns the state WebKit reports.
unsigned long endfield_set_muted(void *rawWebView, bool muted) {
    NSCAssert(NSThread.isMainThread, @"WKWebView must be used on its main thread");
    WKWebView *webView = (__bridge WKWebView *)rawWebView;
    // WebKit SPI (WKWebViewPrivate.h): _WKMediaMutedState, 1 = audio muted.
    SEL setter = NSSelectorFromString(@"_setPageMuted:");
    SEL getter = NSSelectorFromString(@"_mediaMutedState");
    if (![webView respondsToSelector:setter] || ![webView respondsToSelector:getter]) {
        fprintf(stderr, "audio mute_unsupported\n");
        return ULONG_MAX;
    }
    void (*set)(id, SEL, NSUInteger) = (void (*)(id, SEL, NSUInteger))[webView methodForSelector:setter];
    set(webView, setter, muted ? 1 : 0);
    NSUInteger (*get)(id, SEL) = (NSUInteger (*)(id, SEL))[webView methodForSelector:getter];
    NSUInteger state = get(webView, getter);
    fprintf(stderr, "audio muted=%d state=%lu\n", muted, (unsigned long)state);
    return state;
}
