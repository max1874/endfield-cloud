#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>

// The cloud SDK requests a game resolution of (innerWidth x innerHeight) * devicePixelRatio
// and resends it whenever the window resizes, so the game's UI layout follows our
// viewport. The server caps the stream at 1920x1080 (AGENTS.md), so every 16:9 viewport
// whose request reaches that cap gets the same frame, and recognition sees one fixed
// coordinate space. The window therefore takes only the 16:9 sizes offered in Settings
// (src/settings.rs), never a user drag. The content view extends under the title bar and
// WKWebView insets the page by that strip, so the window is sized from contentLayoutRect
// (the unobscured area) rather than the content view.
static const CGFloat DefaultWidth = 1280, StreamWidth = 1920;
static const CGFloat Widths[] = {960, 1280, 1600, 1920, 2240, 2560};
static __weak NSWindow *GameWindow;

static CGFloat Obscured(NSWindow *window) {
    return MAX(NSHeight(window.contentView.bounds) - NSHeight(window.contentLayoutRect), 0);
}

static NSRect FrameFor(NSWindow *window, CGFloat width) {
    return [window frameRectForContentRect:NSMakeRect(0, 0, width, width * 9 / 16 + Obscured(window))];
}

// Why a size is not offered, or nil: it must fit the window's screen and still request
// the full stream. The default stays offered on any display.
static NSString *Unavailable(NSWindow *window, CGFloat width) {
    if (width == DefaultWidth) return nil;
    NSScreen *screen = window.screen ?: NSScreen.mainScreen;
    NSRect frame = FrameFor(window, width);
    if (NSWidth(frame) > NSWidth(screen.visibleFrame) || NSHeight(frame) > NSHeight(screen.visibleFrame)) return @"screen";
    if (width * screen.backingScaleFactor < StreamWidth) return @"resolution";
    return nil;
}

static BOOL FullScreen(NSWindow *window) { return (window.styleMask & NSWindowStyleMaskFullScreen) != 0; }

// Resize keeping the top-left corner, then pull the window back onto its screen.
static void ApplyWidth(NSWindow *window, CGFloat width, BOOL animate) {
    NSRect old = window.frame, visible = (window.screen ?: NSScreen.mainScreen).visibleFrame, frame = FrameFor(window, width);
    frame.origin = NSMakePoint(MIN(MAX(NSMinX(old), NSMinX(visible)), NSMaxX(visible) - NSWidth(frame)),
                               MAX(MIN(NSMaxY(old), NSMaxY(visible)) - NSHeight(frame), NSMinY(visible)));
    [window setFrame:frame display:YES animate:animate];
    fprintf(stderr, "viewport page=%.0fx%.0f obscured=%.0f scale=%.0f\n",
            width, width * 9 / 16, Obscured(window), window.backingScaleFactor);
}

// Full screen keeps the page 16:9 (so the layout and the stream stay the same on a
// 16:10 display): the web view is centred at the largest 16:9 size, with black bars.
// Outside full screen it fills the window again, as wry set it up.
static void Letterbox(WKWebView *webView) {
    NSView *host = webView.superview;
    if (!host) return;
    NSRect bounds = host.bounds;
    if (FullScreen(webView.window)) {
        CGFloat width = MIN(NSWidth(bounds), NSHeight(bounds) * 16 / 9);
        webView.autoresizingMask = NSViewNotSizable;
        webView.frame = NSMakeRect(round(NSMidX(bounds) - width / 2), round(NSMidY(bounds) - width * 9 / 32), width, round(width * 9 / 16));
    } else {
        webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        webView.frame = bounds;
    }
    fprintf(stderr, "viewport fullscreen=%d page=%.0fx%.0f\n", FullScreen(webView.window), NSWidth(webView.frame), NSHeight(webView.frame));
}

// Reports full-screen changes, whichever control made them (src/settings.rs).
extern void endfield_fullscreen_changed(bool fullscreen);

// Lock the game window at `saved`, or the largest offered size below it when the screen
// got smaller. Returns the width applied.
double endfield_lock_viewport(void *rawWebView, double saved) {
    NSCAssert(NSThread.isMainThread, @"NSWindow must be configured on the main thread");
    WKWebView *webView = (__bridge WKWebView *)rawWebView;
    NSWindow *window = webView.window;
    if (!window) {
        fprintf(stderr, "viewport lock_failed=no_window\n");
        return DefaultWidth;
    }
    GameWindow = window;
    window.styleMask &= ~NSWindowStyleMaskResizable;
    window.backgroundColor = NSColor.blackColor;
    __weak WKWebView *weakView = webView;
    for (NSNotificationName name in @[NSWindowDidEnterFullScreenNotification, NSWindowDidExitFullScreenNotification, NSWindowDidResizeNotification])
        [NSNotificationCenter.defaultCenter addObserverForName:name object:window queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) {
            WKWebView *view = weakView;
            if (!view) return;
            if (![note.name isEqualToString:NSWindowDidResizeNotification]) {
                Letterbox(view);
                endfield_fullscreen_changed(FullScreen(view.window));
            } else if (FullScreen(view.window)) {
                Letterbox(view);
            }
        }];
    CGFloat width = DefaultWidth;
    for (size_t i = 0; i < sizeof Widths / sizeof *Widths; i++)
        if (Widths[i] <= saved && !Unavailable(window, Widths[i])) width = Widths[i];
    ApplyWidth(window, width, NO);
    [window center];
    return width;
}

// Apply an offered size; returns false (and changes nothing) for any other request.
bool endfield_viewport_apply(double width) {
    NSCAssert(NSThread.isMainThread, @"NSWindow must be used on the main thread");
    NSWindow *window = GameWindow;
    BOOL known = NO;
    for (size_t i = 0; i < sizeof Widths / sizeof *Widths; i++) known |= Widths[i] == width;
    if (!window || !known || FullScreen(window) || Unavailable(window, width)) return false;
    ApplyWidth(window, width, YES);
    return true;
}

void endfield_viewport_set_fullscreen(bool on) {
    NSWindow *window = GameWindow;
    if (window && FullScreen(window) != on) [window toggleFullScreen:nil];
}

// The sizes and the current state as JSON for the Settings page; the caller frees it.
char *endfield_viewport_state(void) {
    NSCAssert(NSThread.isMainThread, @"NSWindow must be used on the main thread");
    NSWindow *window = GameWindow;
    NSMutableArray *sizes = [NSMutableArray array];
    for (size_t i = 0; i < sizeof Widths / sizeof *Widths; i++)
        [sizes addObject:@{@"width": @(Widths[i]), @"height": @(Widths[i] * 9 / 16), @"default": @((BOOL)(Widths[i] == DefaultWidth)),
                           @"unavailable": (window ? Unavailable(window, Widths[i]) : nil) ?: NSNull.null}];
    NSDictionary *state = @{@"sizes": sizes, @"current": @(window ? NSWidth(window.contentLayoutRect) : 0),
                            @"fullscreen": @((BOOL)(window && FullScreen(window)))};
    NSData *json = [NSJSONSerialization dataWithJSONObject:state options:0 error:nil];
    return strdup([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
}
