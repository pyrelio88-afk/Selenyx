use std::fs;
use std::path::PathBuf;

const DEV_SIDECAR_STUB: &[u8] = b"SELENYX_DEV_SIDECAR_STUB";

/// Allow `cargo check` / `cargo test` / `tauri dev` (`PROFILE=debug`) to build
/// cleanly on a fresh checkout before PyInstaller has produced the packaged
/// sidecar, while never allowing the placeholder into a `release` bundle.
fn prepare_sidecar_placeholder_for_debug() {
    let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") else {
        return;
    };
    let Ok(target) = std::env::var("TARGET") else {
        return;
    };
    let profile = std::env::var("PROFILE").unwrap_or_default();
    let ext = if target.contains("windows") {
        ".exe"
    } else {
        ""
    };
    let sidecar_path = PathBuf::from(manifest_dir)
        .join("binaries")
        .join(format!("selenyx-backend-{target}{ext}"));

    println!("cargo:rerun-if-changed={}", sidecar_path.display());

    if profile == "debug" {
        if !sidecar_path.exists() {
            if let Some(parent) = sidecar_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&sidecar_path, DEV_SIDECAR_STUB);
        }
    } else {
        let is_stub = fs::metadata(&sidecar_path)
            .map(|meta| meta.len() == DEV_SIDECAR_STUB.len() as u64)
            .unwrap_or(false)
            && fs::read(&sidecar_path)
                .map(|bytes| bytes == DEV_SIDECAR_STUB)
                .unwrap_or(false);
        if is_stub {
            let _ = fs::remove_file(&sidecar_path);
        }
    }
}

fn main() {
    prepare_sidecar_placeholder_for_debug();
    tauri_build::build()
}
