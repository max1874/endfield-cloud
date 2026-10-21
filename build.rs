fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let sources = [
            "native/pointer_lock.m",
            "native/automation.m",
            "native/background.m",
            "native/webrtc.m",
            "native/viewport.m",
            "native/dev.m",
        ];
        cc::Build::new()
            .files(sources)
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .compile("endfield_pointer_lock");
        for source in sources {
            println!("cargo:rerun-if-changed={source}");
        }
        println!("cargo:rustc-link-lib=framework=Vision");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=WebKit");
    }
    tauri_build::build();
}
