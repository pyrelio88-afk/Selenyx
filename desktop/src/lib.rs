// Selenyx 桌面端库 — Tauri v2
// 桌面 (Windows/macOS/Linux) + 移动端 (Android/iOS) 共用入口
//
// 原生能力：
//  - 启动时创建数据目录 ~/.selenyx/{projects,attachments,exports}
//  - tauri-plugin-store：结构化键值持久化（供前端按需迁移大数据，告别浏览器存储上限）
//  - export_state / import_state：把整份应用状态 JSON 备份到 ~/.selenyx/ 或从备份恢复
//  - webview localStorage 在各平台默认持久化到应用数据目录，桌面端数据不丢

use std::fs;
use tauri::Manager;

#[cfg(all(not(mobile), not(debug_assertions)))]
use tauri_plugin_shell::ShellExt;

/// Production desktop bundles include a frozen FastAPI sidecar. Development
/// starts the same service through `npm run dev:local`, while mobile clients
/// deliberately do not attempt to spawn desktop executables.
#[cfg(all(not(mobile), not(debug_assertions)))]
fn start_local_backend(app: &tauri::AppHandle) -> Result<(), String> {
    let command = app
        .shell()
        .sidecar("selenyx-backend")
        .map_err(|error| format!("Unable to prepare local backend: {error}"))?;
    let (_events, _child) = command
        .spawn()
        .map_err(|error| format!("Unable to start local backend: {error}"))?;
    Ok(())
}

/// 取数据目录 ~/.selenyx/
fn data_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    let home = app
        .path()
        .home_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
    home.join(".selenyx")
}

/// 原生命令：导出应用状态到本地备份文件
/// 前端把整份 store JSON 传入，写入 ~/.selenyx/selenyx-state-backup.json
#[tauri::command]
fn export_state(app: tauri::AppHandle, json: String) -> Result<String, String> {
    let dir = data_dir(&app);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("selenyx-state-backup.json");
    fs::write(&path, &json).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// 原生命令：从本地备份文件导入应用状态
#[tauri::command]
fn import_state(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = data_dir(&app).join("selenyx-state-backup.json");
    if !path.exists() {
        return Ok(None);
    }
    let json = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(Some(json))
}

/// 原生命令：返回数据目录路径（前端可用于保存导出文件等）
#[tauri::command]
fn app_data_dir(app: tauri::AppHandle) -> String {
    data_dir(&app).to_string_lossy().into_owned()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            export_state,
            import_state,
            app_data_dir
        ])
        .setup(|app| {
            // 创建数据目录 ~/.selenyx/
            let home = app
                .path()
                .home_dir()
                .expect("无法获取 HOME 目录");
            let data_dir = home.join(".selenyx");
            fs::create_dir_all(&data_dir).ok();
            fs::create_dir_all(data_dir.join("projects")).ok();
            fs::create_dir_all(data_dir.join("attachments")).ok();
            fs::create_dir_all(data_dir.join("exports")).ok();

            #[cfg(all(not(mobile), not(debug_assertions)))]
            start_local_backend(app.handle())?;

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
