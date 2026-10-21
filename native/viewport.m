#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>

// The cloud SDK requests a game resolution of (innerWidth x innerHeight) * devicePixelRatio
// and resends it whenever the window resizes, so the game's UI layout follows our
// viewport. Recognition needs one fixed coordinate space, so the page viewport is held
// at a fixed 16:9 size. The content view extends under the title bar and WKWebView
// insets the page by that strip, so the window is sized from contentLayoutRect (the
// unobscured area) rather than the content view. The window is not user-resizable.
static const CGFloat ViewportWidth = 1280, ViewportHeight = 720;

void endfield_lock_viewport(void *rawWebView) {
    NSCAssert(NSThread.isMainThread, @"NSWindow must be configured on the main thread");
    WKWebView *webView = (__bridge WKWebView *)rawWebView;
    NSWindow *window = webView.window;
    if (!window) {
        fprintf(stderr, "viewport lock_failed=no_window\n");
        return;
    }
    window.styleMask &= ~NSWindowStyleMaskResizable;
    CGFloat obscured = NSHeight(window.contentView.bounds) - NSHeight(window.contentLayoutRect);
    NSSize content = NSMakeSize(ViewportWidth, ViewportHeight + MAX(obscured, 0));
    [window setContentSize:content];
    fprintf(stderr, "viewport locked page=%.0fx%.0f content=%.0fx%.0f obscured=%.0f scale=%.0f\n",
            ViewportWidth, ViewportHeight, content.width, content.height, obscured, window.backingScaleFactor);
}
