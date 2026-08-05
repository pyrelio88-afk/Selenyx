// Selenyx 桌面端库 — Tauri v2
// 提供桌面 + 移动端共用的应用逻辑

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // 创建数据目录 ~/.selenyx/
            let home = app.path().home_dir().expect("无法获取 HOME 目录");
            let data_dir = home.join(".selenyx");
            std::fs::create_dir_all(&data_dir).ok();
            std::fs::create_dir_all(data_dir.join("projects")).ok();
            std::fs::create_dir_all(data_dir.join("attachments")).ok();
            std::fs::create_dir_all(data_dir.join("exports")).ok();

            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Selenyx 启动失败");
}
