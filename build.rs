fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("native/pointer_lock.m")
            .file("native/automation.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .compile("endfield_pointer_lock");
        println!("cargo:rerun-if-changed=native/pointer_lock.m");
        println!("cargo:rerun-if-changed=native/automation.m");
        println!("cargo:rustc-link-lib=framework=Vision");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=WebKit");
    }
    tauri_build::build();
}
