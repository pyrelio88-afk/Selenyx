//! Selenyx Tauri shell.
//!
//! The application UI is a static React/Vite bundle.  This host deliberately
//! starts no local HTTP service, sidecar, database, or model runtime; browser
//! storage remains the source of truth for workspace data.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Selenyx failed to launch");
}
