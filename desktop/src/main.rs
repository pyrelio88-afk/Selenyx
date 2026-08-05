// Selenyx 桌面端 — Tauri v2 入口
// 桌面 (Windows/macOS/Linux) + 移动端 (Android/iOS) 共用

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    selenyx_desktop_lib::run()
}
