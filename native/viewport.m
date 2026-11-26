#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>

// The cloud SDK requests a game resolution of (innerWidth x innerHeight) * devicePixelRatio
// and resends it whenever the window resizes, so the game's UI layout follows our
// viewport. The server caps the stream at 1920x1080 (AGENTS.md), so every 16:9 viewport
// whose request reaches that cap gets the same frame, and recognition sees one fixed
// coordinate space. The window therefore takes only the 16:9 sizes offered in Settings,
// never a user drag. The content view extends under the title bar and WKWebView insets
// the page by that strip, so the window is sized from contentLayoutRect (the unobscured
// area) rather than the content view.
static const CGFloat DefaultWidth = 1280, StreamWidth = 1920;
static const CGFloat Widths[] = {960, 1280, 1600, 1920, 2240, 2560};
static NSString *const WidthKey = @"viewportWidth";
static __weak NSWindow *GameWindow;

static CGFloat Obscured(NSWindow *window) {
    return MAX(NSHeight(window.contentView.bounds) - NSHeight(window.contentLayoutRect), 0);
}

// Sizes that fit the window's screen and still request the full stream; the default
// stays offered on any display.
static NSArray<NSNumber *> *OfferedWidths(NSWindow *window) {
    NSScreen *screen = window.screen ?: NSScreen.mainScreen;
    NSSize visible = screen.visibleFrame.size;
    NSMutableArray *widths = [NSMutableArray array];
    for (size_t i = 0; i < sizeof Widths / sizeof *Widths; i++) {
        CGFloat width = Widths[i];
        NSRect frame = [window frameRectForContentRect:NSMakeRect(0, 0, width, width * 9 / 16 + Obscured(window))];
        BOOL fits = NSWidth(frame) <= visible.width && NSHeight(frame) <= visible.height;
        if (width == DefaultWidth || (fits && width * screen.backingScaleFactor >= StreamWidth)) [widths addObject:@(width)];
    }
    return widths;
}

// The saved width, or the largest offered one below it when the screen got smaller.
static CGFloat SavedWidth(NSWindow *window) {
    CGFloat saved = [NSUserDefaults.standardUserDefaults doubleForKey:WidthKey] ?: DefaultWidth, width = DefaultWidth;
    for (NSNumber *offered in OfferedWidths(window))
        if (offered.doubleValue <= saved) width = offered.doubleValue;
    return width;
}

// Resize keeping the top-left corner, then pull the window back onto its screen.
static void ApplyWidth(NSWindow *window, CGFloat width, BOOL animate) {
    NSRect old = window.frame, visible = (window.screen ?: NSScreen.mainScreen).visibleFrame;
    NSRect frame = [window frameRectForContentRect:NSMakeRect(0, 0, width, width * 9 / 16 + Obscured(window))];
    frame.origin = NSMakePoint(MIN(MAX(NSMinX(old), NSMinX(visible)), NSMaxX(visible) - NSWidth(frame)),
                               MAX(MIN(NSMaxY(old), NSMaxY(visible)) - NSHeight(frame), NSMinY(visible)));
    [window setFrame:frame display:YES animate:animate];
    fprintf(stderr, "viewport page=%.0fx%.0f obscured=%.0f scale=%.0f\n",
            width, width * 9 / 16, Obscured(window), window.backingScaleFactor);
}

void endfield_lock_viewport(void *rawWebView) {
    NSCAssert(NSThread.isMainThread, @"NSWindow must be configured on the main thread");
    NSWindow *window = ((__bridge WKWebView *)rawWebView).window;
    if (!window) {
        fprintf(stderr, "viewport lock_failed=no_window\n");
        return;
    }
    GameWindow = window;
    window.styleMask &= ~NSWindowStyleMaskResizable;
    ApplyWidth(window, SavedWidth(window), NO);
    [window center];
}

// 云终末地设置 (App menu, Cmd+,): one pane, applied as soon as a size is picked.
@interface EndfieldSettings : NSObject
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) NSPopUpButton *size;
@end

@implementation EndfieldSettings
- (instancetype)init {
    if (!(self = [super init])) return nil;
    _size = [NSPopUpButton new];
    _size.target = self;
    _size.action = @selector(pick:);
    NSTextField *label = [NSTextField labelWithString:@"窗口大小："];
    NSTextField *note = [NSTextField wrappingLabelWithString:
        @"窗口始终保持 16:9。云游戏画面最高 1920 × 1080，窗口更大只是放大显示；自动化在任何一档下都能运行。"];
    note.font = [NSFont systemFontOfSize:NSFont.smallSystemFontSize];
    note.textColor = NSColor.secondaryLabelColor;
    note.preferredMaxLayoutWidth = 300;
    NSGridView *grid = [NSGridView gridViewWithViews:@[@[label, _size], @[NSGridCell.emptyContentView, note]]];
    grid.rowSpacing = 8;
    grid.columnSpacing = 8;
    [grid columnAtIndex:0].xPlacement = NSGridCellPlacementTrailing;
    [grid rowAtIndex:0].rowAlignment = NSGridRowAlignmentLastBaseline;
    grid.translatesAutoresizingMaskIntoConstraints = NO;

    _window = [[NSWindow alloc] initWithContentRect:NSZeroRect styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable
                                            backing:NSBackingStoreBuffered defer:YES];
    _window.title = @"云终末地设置";
    _window.releasedWhenClosed = NO;
    [_window standardWindowButton:NSWindowZoomButton].enabled = NO;
    [_window.contentView addSubview:grid];
    [NSLayoutConstraint activateConstraints:@[
        [grid.topAnchor constraintEqualToAnchor:_window.contentView.topAnchor constant:20],
        [grid.bottomAnchor constraintEqualToAnchor:_window.contentView.bottomAnchor constant:-20],
        [grid.leadingAnchor constraintEqualToAnchor:_window.contentView.leadingAnchor constant:20],
        [grid.trailingAnchor constraintEqualToAnchor:_window.contentView.trailingAnchor constant:-20],
    ]];
    return self;
}

- (void)show {
    NSWindow *game = GameWindow;
    [self.size removeAllItems];
    CGFloat current = game ? NSWidth(game.contentLayoutRect) : DefaultWidth;
    for (NSNumber *width in game ? OfferedWidths(game) : @[@(DefaultWidth)]) {
        CGFloat w = width.doubleValue;
        [self.size addItemWithTitle:[NSString stringWithFormat:@"%.0f × %.0f%@", w, w * 9 / 16, w == DefaultWidth ? @"（默认）" : @""]];
        self.size.lastItem.representedObject = width;
        if (w == current) [self.size selectItem:self.size.lastItem];
    }
    // A full-screen window takes the screen's size, not ours.
    self.size.enabled = game && !(game.styleMask & NSWindowStyleMaskFullScreen);
    if (!self.window.isVisible) [self.window center];
    [self.window makeKeyAndOrderFront:nil];
}

- (void)pick:(NSPopUpButton *)sender {
    NSWindow *game = GameWindow;
    CGFloat width = [sender.selectedItem.representedObject doubleValue];
    if (!game || !width) return;
    [NSUserDefaults.standardUserDefaults setDouble:width forKey:WidthKey];
    ApplyWidth(game, width, YES);
}
@end

void endfield_open_settings(void) {
    static EndfieldSettings *settings;
    dispatch_async(dispatch_get_main_queue(), ^{
        if (!settings) settings = [EndfieldSettings new];
        [settings show];
    });
}
