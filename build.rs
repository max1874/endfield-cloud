use std::{
    fs,
    path::{Path, PathBuf},
};

fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = chunk.iter().enumerate().fold(0u32, |n, (i, b)| n | (*b as u32) << (16 - 8 * i));
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(TABLE[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

fn sorted_files(dir: &str, extension: &str) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = fs::read_dir(dir)
        .map(|entries| entries.flatten().map(|entry| entry.path()).collect())
        .unwrap_or_default();
    files.retain(|path| path.extension().is_some_and(|ext| ext == extension));
    files.sort();
    files
}

// Bundle the automation engine into one script: recognition templates as data URLs,
// then the engine core, screens, runner and every task.
fn bundle_engine() {
    let mut script = String::from("window.__engineTemplates = {\n");
    for path in sorted_files("templates", "png") {
        let name = path.file_stem().unwrap().to_string_lossy();
        let bytes = fs::read(&path).expect("read template");
        script.push_str(&format!("  {name:?}: \"data:image/png;base64,{}\",\n", base64(&bytes)));
    }
    script.push_str("};\n");
    let mut sources: Vec<PathBuf> = ["native/engine/core.js", "native/engine/screens.js", "native/engine/session.js", "native/engine/runner.js"]
        .iter()
        .map(PathBuf::from)
        .collect();
    sources.extend(sorted_files("native/engine/tasks", "js"));
    for path in &sources {
        script.push_str(&format!("// ---- {} ----\n", path.display()));
        script.push_str(&fs::read_to_string(path).expect("read engine source"));
        script.push('\n');
    }
    let out = Path::new(&std::env::var("OUT_DIR").unwrap()).join("engine.js");
    fs::write(out, script).expect("write engine bundle");
    println!("cargo:rerun-if-changed=templates");
    println!("cargo:rerun-if-changed=native/engine");
    println!("cargo:rerun-if-changed=native/engine/tasks");
}

fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let sources = [
            "native/pointer_lock.m",
            "native/background.m",
            "native/webrtc.m",
            "native/viewport.m",
            "native/engine.m",
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
    bundle_engine();
    tauri_build::build();
}
