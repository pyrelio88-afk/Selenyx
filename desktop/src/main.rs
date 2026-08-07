// Selenyx Tauri entry point for desktop and mobile WebView shells.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    selenyx_desktop_lib::run()
}
