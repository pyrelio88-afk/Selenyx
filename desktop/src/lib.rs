// Selenyx 桌面端库 — Tauri v2
// 桌面端 (Windows/macOS/Linux) 原生宿主入口
//
// 原生能力：
//  - 启动时创建数据目录 ~/.selenyx/{projects,attachments,exports}
//  - 后台线程异步探测并按需拉起本地 FastAPI sidecar，退出时清理整棵进程树
//  - tauri-plugin-store：结构化键值持久化（供前端按需迁移大数据，告别浏览器存储上限）
//  - export_state / import_state：把整份应用状态 JSON 备份到 ~/.selenyx/ 或从备份恢复
//  - webview localStorage 在各平台默认持久化到应用数据目录，桌面端数据不丢

use serde::Deserialize;
use std::fs;
use std::io::{ErrorKind, Write};
use tauri::Manager;

mod pet;

#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
use tauri_plugin_shell::ShellExt;

#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
use std::io::Read;
#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
use std::net::{SocketAddr, TcpListener, TcpStream};
#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
use std::time::Duration;

#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
const LOCAL_BACKEND_ADDR: &str = "127.0.0.1:8770";

#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
const HEALTH_PROBE_TIMEOUT: Duration = Duration::from_millis(350);

#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
const MAX_HEALTH_RESPONSE_BYTES: usize = 8 * 1024;

const MAX_STATE_BACKUP_BYTES: u64 = 50 * 1024 * 1024;

#[cfg(not(mobile))]
#[derive(Debug)]
struct SidecarSlot<T> {
    child: Option<T>,
    shutting_down: bool,
}

#[cfg(not(mobile))]
impl<T> Default for SidecarSlot<T> {
    fn default() -> Self {
        Self {
            child: None,
            shutting_down: false,
        }
    }
}

#[cfg(not(mobile))]
impl<T> SidecarSlot<T> {
    #[cfg(any(not(debug_assertions), test))]
    fn is_shutting_down(&self) -> bool {
        self.shutting_down
    }

    #[cfg(any(not(debug_assertions), test))]
    fn attach(&mut self, child: T) -> Result<Option<T>, T> {
        if self.shutting_down {
            Err(child)
        } else {
            Ok(self.child.replace(child))
        }
    }

    fn take_for_shutdown(&mut self) -> Option<T> {
        if self.shutting_down {
            return None;
        }
        self.shutting_down = true;
        self.child.take()
    }
}

#[cfg(not(mobile))]
struct SidecarState(std::sync::Mutex<SidecarSlot<tauri_plugin_shell::process::CommandChild>>);

#[cfg(not(mobile))]
impl SidecarState {
    fn new() -> Self {
        Self(std::sync::Mutex::new(SidecarSlot::default()))
    }
}

#[cfg(not(mobile))]
fn terminate_sidecar_child(child: tauri_plugin_shell::process::CommandChild) {
    let pid = child.pid();
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x08000000)
            .status();
    }
    #[cfg(not(target_os = "windows"))]
    let _ = pid;
    let _ = child.kill();
}

#[cfg(not(mobile))]
fn stop_local_backend(app: &tauri::AppHandle) {
    let child = {
        let state = app.state::<SidecarState>();
        let mut guard = state
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.take_for_shutdown()
    };
    if let Some(child) = child {
        terminate_sidecar_child(child);
    }
}

#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LocalBackendProbe {
    HealthySelenyx,
    VacantPort,
    OccupiedOrUnhealthy,
}

#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LocalBackendStartAction {
    ReuseHealthy,
    SpawnSidecar,
    LeaveUnavailable,
}

#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
fn local_backend_start_action(probe: LocalBackendProbe) -> LocalBackendStartAction {
    match probe {
        LocalBackendProbe::HealthySelenyx => LocalBackendStartAction::ReuseHealthy,
        LocalBackendProbe::VacantPort => LocalBackendStartAction::SpawnSidecar,
        LocalBackendProbe::OccupiedOrUnhealthy => LocalBackendStartAction::LeaveUnavailable,
    }
}

#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
#[derive(Deserialize)]
struct LocalBackendHealth {
    status: String,
    version: String,
    storage: String,
}

/// Confirm that a response is specifically from the loopback Selenyx backend,
/// rather than merely treating any process that owns port 8770 as reusable.
#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
fn is_healthy_selenyx_response(response: &[u8]) -> bool {
    let Some(header_end) = response.windows(4).position(|window| window == b"\r\n\r\n") else {
        return false;
    };

    let Ok(headers) = std::str::from_utf8(&response[..header_end]) else {
        return false;
    };
    let Some(status_line) = headers.lines().next() else {
        return false;
    };
    if !(status_line.starts_with("HTTP/1.1 200") || status_line.starts_with("HTTP/1.0 200")) {
        return false;
    }

    let Ok(health) = serde_json::from_slice::<LocalBackendHealth>(&response[(header_end + 4)..])
    else {
        return false;
    };
    health.status == "ok" && health.storage == "local-sqlite" && !health.version.trim().is_empty()
}

#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
fn read_limited_health_response(stream: &mut TcpStream) -> Option<Vec<u8>> {
    let mut response = Vec::new();
    let mut buffer = [0_u8; 1024];

    loop {
        match stream.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => {
                response.extend_from_slice(&buffer[..read]);
                if response.len() > MAX_HEALTH_RESPONSE_BYTES {
                    return None;
                }
            }
            Err(error) if matches!(error.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) => {
                // A local FastAPI health response is very small. If it has
                // already arrived, parse it; otherwise treat the listener as
                // occupied but not reusable.
                break;
            }
            Err(_) => return None,
        }
    }

    (!response.is_empty()).then_some(response)
}

/// Probe only the fixed IPv4 loopback endpoint used by the packaged sidecar.
/// This deliberately performs no DNS lookup and never probes a LAN address.
#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
fn vacant_or_occupied_port(address: SocketAddr) -> LocalBackendProbe {
    match TcpListener::bind(address) {
        Ok(listener) => {
            drop(listener);
            LocalBackendProbe::VacantPort
        }
        Err(_) => LocalBackendProbe::OccupiedOrUnhealthy,
    }
}

#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
fn probe_local_backend_at(address: SocketAddr) -> LocalBackendProbe {
    let mut stream = match TcpStream::connect_timeout(&address, HEALTH_PROBE_TIMEOUT) {
        Ok(stream) => stream,
        Err(_) => return vacant_or_occupied_port(address),
    };

    if stream.set_read_timeout(Some(HEALTH_PROBE_TIMEOUT)).is_err()
        || stream
            .set_write_timeout(Some(HEALTH_PROBE_TIMEOUT))
            .is_err()
    {
        return LocalBackendProbe::OccupiedOrUnhealthy;
    }
    let request = format!(
        "GET /api/health HTTP/1.1\r\nHost: {address}\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return LocalBackendProbe::OccupiedOrUnhealthy;
    }

    match read_limited_health_response(&mut stream) {
        Some(response) if is_healthy_selenyx_response(&response) => {
            LocalBackendProbe::HealthySelenyx
        }
        _ => LocalBackendProbe::OccupiedOrUnhealthy,
    }
}

#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
fn probe_local_backend() -> LocalBackendProbe {
    let address: SocketAddr = LOCAL_BACKEND_ADDR
        .parse()
        .expect("the fixed loopback backend address must parse");
    probe_local_backend_at(address)
}

/// Production desktop bundles include a frozen FastAPI sidecar. Development
/// starts the same service through `npm run dev:local`, while mobile clients
/// deliberately do not attempt to spawn desktop executables.
#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
fn start_local_backend(app: &tauri::AppHandle) {
    {
        let state = app.state::<SidecarState>();
        let guard = state
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.is_shutting_down() {
            return;
        }
    }

    match local_backend_start_action(probe_local_backend()) {
        LocalBackendStartAction::ReuseHealthy => {
            eprintln!("Reusing the healthy local Selenyx backend on {LOCAL_BACKEND_ADDR}.");
        }
        LocalBackendStartAction::LeaveUnavailable => {
            // Never kill or bind over an unknown local listener. The webview's
            // existing /api/health check will mark the backend as unavailable.
            eprintln!(
                "Local backend port {LOCAL_BACKEND_ADDR} is occupied or unhealthy; starting the UI without a sidecar."
            );
        }
        LocalBackendStartAction::SpawnSidecar => {
            let command = match app.shell().sidecar("selenyx-backend") {
                Ok(command) => command,
                Err(error) => {
                    eprintln!("Unable to prepare the local backend sidecar: {error}");
                    return;
                }
            };
            match command.spawn() {
                Ok((mut rx, child)) => {
                    tauri::async_runtime::spawn(async move {
                        while rx.recv().await.is_some() {}
                    });

                    let attach_outcome = {
                        let state = app.state::<SidecarState>();
                        let mut guard = state
                            .0
                            .lock()
                            .unwrap_or_else(|poisoned| poisoned.into_inner());
                        guard.attach(child)
                    };

                    match attach_outcome {
                        Ok(Some(previous)) => terminate_sidecar_child(previous),
                        Ok(None) => {}
                        Err(orphan) => terminate_sidecar_child(orphan),
                    }
                }
                Err(error) => {
                    eprintln!("Unable to start the local backend sidecar: {error}");
                }
            }
        }
    }
}

/// 取数据目录 ~/.selenyx/
fn data_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    let home = app
        .path()
        .home_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| std::env::temp_dir()));
    home.join(".selenyx")
}

fn state_backup_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    data_dir(app).join("selenyx-state-backup.json")
}

fn validate_state_backup_json_with_limit(json: &str, max_bytes: u64) -> Result<(), String> {
    if json.len() as u64 > max_bytes {
        return Err("State backup is too large".to_string());
    }
    match serde_json::from_str::<serde_json::Value>(json) {
        Ok(serde_json::Value::Object(_)) => Ok(()),
        Ok(_) => Err("State backup must be a JSON object".to_string()),
        Err(_) => Err("State backup is not valid JSON".to_string()),
    }
}

fn validate_state_backup_json(json: &str) -> Result<(), String> {
    validate_state_backup_json_with_limit(json, MAX_STATE_BACKUP_BYTES)
}

/// Write beside the existing snapshot, sync it, then rename it into place so
/// an interrupted save never leaves a half-written recovery file.
fn write_atomically(path: &std::path::Path, bytes: &[u8], label: &str) -> Result<(), String> {
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "System clock is invalid".to_string())?
        .as_nanos();
    let temporary_path = path.with_extension(format!("{}.{}.tmp", std::process::id(), nonce));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary_path)
        .map_err(|_| format!("Unable to create temporary {label}"))?;
    if let Err(error) = file.write_all(bytes).and_then(|_| file.sync_all()) {
        let _ = fs::remove_file(&temporary_path);
        return Err(format!("Unable to write {label}: {error}"));
    }
    if let Err(error) = fs::rename(&temporary_path, path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(format!("Unable to finalize {label}: {error}"));
    }
    Ok(())
}

fn write_state_backup_atomically(path: &std::path::Path, json: &str) -> Result<(), String> {
    write_atomically(path, json.as_bytes(), "state backup")
}

/// 原生命令：导出应用状态到本地备份文件
/// 前端把整份 store JSON 传入，写入 ~/.selenyx/selenyx-state-backup.json
#[tauri::command]
fn export_state(app: tauri::AppHandle, json: String) -> Result<String, String> {
    validate_state_backup_json(&json)?;
    let dir = data_dir(&app);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = state_backup_path(&app);
    write_state_backup_atomically(&path, &json)?;
    Ok(path.to_string_lossy().into_owned())
}

/// 原生命令：从本地备份文件导入应用状态
#[tauri::command]
fn import_state(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = state_backup_path(&app);
    if !path.exists() {
        return Ok(None);
    }
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.len() > MAX_STATE_BACKUP_BYTES {
        return Err("State backup is too large".to_string());
    }
    let json = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    validate_state_backup_json(&json)?;
    Ok(Some(json))
}

/// Delete the explicit native recovery snapshot. This intentionally does not
/// touch the WebView cache or the separately managed local SQLite database.
#[tauri::command]
fn delete_state_backup(app: tauri::AppHandle) -> Result<(), String> {
    match fs::remove_file(state_backup_path(&app)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

/// 原生命令：返回数据目录路径（前端可用于保存导出文件等）
#[tauri::command]
fn app_data_dir(app: tauri::AppHandle) -> String {
    data_dir(&app).to_string_lossy().into_owned()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalLlmConfig {
    api_key: Option<String>,
    base_url: String,
    model: String,
}

fn validate_env_value(name: &str, value: &str, allow_empty: bool) -> Result<String, String> {
    let trimmed = value.trim();
    if !allow_empty && trimmed.is_empty() {
        return Err(format!("{name} cannot be empty"));
    }
    if trimmed.len() > 8_192 || trimmed.chars().any(|ch| matches!(ch, '\r' | '\n' | '\0')) {
        return Err(format!("{name} contains an invalid value"));
    }
    Ok(trimmed.to_string())
}

fn upsert_env_value(contents: &str, key: &str, value: &str) -> String {
    let prefix = format!("{key}=");
    let mut found = false;
    let mut lines: Vec<String> = contents
        .lines()
        .map(|line| {
            if line.starts_with(&prefix) {
                found = true;
                format!("{prefix}{value}")
            } else {
                line.to_string()
            }
        })
        .collect();
    if !found {
        lines.push(format!("{prefix}{value}"));
    }
    format!("{}\n", lines.join("\n"))
}

fn merge_local_llm_config(
    current: &str,
    api_key: Option<&str>,
    base_url: &str,
    model: &str,
) -> Result<String, String> {
    let base_url = validate_env_value("Base URL", base_url, false)?;
    let model = validate_env_value("Model", model, false)?;
    let next = upsert_env_value(current, "SELENYX_LLM_BASE_URL", &base_url);
    // `None` means the user is only changing the model or endpoint.  Keep an
    // existing private key in the native file rather than asking the WebView
    // to read and re-submit it.  An explicit empty string is used for Ollama
    // and intentionally clears a former remote-provider key.
    let next = match api_key {
        Some(api_key) => {
            let api_key = validate_env_value("API key", api_key, true)?;
            upsert_env_value(&next, "SELENYX_LLM_API_KEY", &api_key)
        }
        None => next,
    };
    Ok(upsert_env_value(&next, "SELENYX_LLM_MODEL", &model))
}

/// The UI may write a key, but it never receives the key back. This keeps the
/// secret out of WebView localStorage and frontend build artifacts.
#[tauri::command]
fn save_llm_config(app: tauri::AppHandle, config: LocalLlmConfig) -> Result<(), String> {
    let dir = data_dir(&app);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path = dir.join(".env.local");
    let current = match fs::read_to_string(&path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.to_string()),
    };
    let next = merge_local_llm_config(
        &current,
        config.api_key.as_deref(),
        &config.base_url,
        &config.model,
    )?;
    write_atomically(&path, next.as_bytes(), "local LLM configuration")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build());

    #[cfg(not(mobile))]
    let builder = builder.manage(SidecarState::new());

    let app = builder
        .invoke_handler(tauri::generate_handler![
            export_state,
            import_state,
            delete_state_backup,
            app_data_dir,
            save_llm_config,
            pet::toggle_pet
        ])
        .on_window_event(|window, event| {
            if window.label() == pet::MAIN_LABEL && matches!(event, tauri::WindowEvent::Destroyed)
            {
                if let Some(pet_window) = window.app_handle().get_webview_window(pet::PET_LABEL) {
                    let _ = pet_window.close();
                }
            }
        })
        .setup(|app| {
            // 创建数据目录 ~/.selenyx/
            let dir = data_dir(app.handle());
            fs::create_dir_all(&dir).ok();
            fs::create_dir_all(dir.join("projects")).ok();
            fs::create_dir_all(dir.join("attachments")).ok();
            fs::create_dir_all(dir.join("exports")).ok();

            #[cfg(all(not(mobile), not(debug_assertions)))]
            {
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    start_local_backend(&app_handle);
                });
            }

            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window(pet::MAIN_LABEL) {
                    window.open_devtools();
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Selenyx 启动失败");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            #[cfg(not(mobile))]
            stop_local_backend(app_handle);
            #[cfg(mobile)]
            let _ = app_handle;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{
        merge_local_llm_config, upsert_env_value, validate_env_value, validate_state_backup_json,
        validate_state_backup_json_with_limit, write_state_backup_atomically,
    };
    use std::fs;

    #[cfg(not(mobile))]
    use super::{
        is_healthy_selenyx_response, local_backend_start_action, probe_local_backend_at,
        LocalBackendProbe, LocalBackendStartAction, SidecarSlot, MAX_HEALTH_RESPONSE_BYTES,
    };

    #[test]
    fn local_llm_values_reject_multiline_injection() {
        assert!(validate_env_value("API key", "safe-value\nOTHER=value", true).is_err());
        assert!(validate_env_value("Base URL", "https://example.test\r\nX=1", false).is_err());
        assert!(validate_env_value("Model", "   ", false).is_err());
    }

    #[test]
    fn local_llm_values_replace_only_the_requested_key() {
        let existing = "SELENYX_DATA_DIR=C:/data\nSELENYX_LLM_MODEL=old\n";
        let updated = upsert_env_value(existing, "SELENYX_LLM_MODEL", "new-model");
        assert!(updated.contains("SELENYX_DATA_DIR=C:/data"));
        assert!(updated.contains("SELENYX_LLM_MODEL=new-model"));
        assert!(!updated.contains("SELENYX_LLM_MODEL=old"));
    }

    #[test]
    fn updating_a_private_llm_model_never_requires_or_erases_the_existing_key() {
        let existing = "SELENYX_LLM_API_KEY=private-value\nSELENYX_LLM_MODEL=old\n";
        let updated =
            merge_local_llm_config(existing, None, "https://api.example.test/v1", "new-model")
                .unwrap();
        assert!(updated.contains("SELENYX_LLM_API_KEY=private-value"));
        assert!(updated.contains("SELENYX_LLM_MODEL=new-model"));
    }

    #[test]
    fn local_ollama_selection_can_explicitly_clear_a_former_remote_key() {
        let existing = "SELENYX_LLM_API_KEY=private-value\n";
        let updated =
            merge_local_llm_config(existing, Some(""), "http://127.0.0.1:11434/v1", "qwen3")
                .unwrap();
        assert!(updated.contains("SELENYX_LLM_API_KEY=\n"));
    }

    #[test]
    fn state_backup_must_be_a_json_object() {
        assert!(validate_state_backup_json(r#"{"schemaVersion":2,"projects":[]}"#).is_ok());
        assert_eq!(
            validate_state_backup_json("[]").unwrap_err(),
            "State backup must be a JSON object"
        );
        assert_eq!(
            validate_state_backup_json("null").unwrap_err(),
            "State backup must be a JSON object"
        );
        assert_eq!(
            validate_state_backup_json("\"scalar\"").unwrap_err(),
            "State backup must be a JSON object"
        );
        assert_eq!(
            validate_state_backup_json("not json").unwrap_err(),
            "State backup is not valid JSON"
        );
    }

    #[test]
    fn state_backup_enforces_maximum_byte_budget() {
        let exact = r#"{"ok":true}"#;
        assert!(validate_state_backup_json_with_limit(exact, exact.len() as u64).is_ok());
        assert_eq!(
            validate_state_backup_json_with_limit(exact, (exact.len() - 1) as u64).unwrap_err(),
            "State backup is too large"
        );
    }

    #[test]
    fn state_backup_atomic_write_replaces_a_complete_snapshot_without_temp_leftovers() {
        let directory =
            std::env::temp_dir().join(format!("selenyx-state-test-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("state.json");
        fs::write(&path, r#"{"old":true}"#).unwrap();
        write_state_backup_atomically(&path, r#"{"new":true}"#).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"new":true}"#);
        let entries: Vec<_> = fs::read_dir(&directory)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(entries.len(), 1);
        fs::remove_dir_all(&directory).unwrap();
    }

    #[cfg(not(mobile))]
    #[test]
    fn only_a_real_selenyx_health_payload_is_reusable() {
        let healthy = b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n{\"status\":\"ok\",\"version\":\"0.4.0\",\"storage\":\"local-sqlite\"}";
        assert!(is_healthy_selenyx_response(healthy));

        let http10_healthy = b"HTTP/1.0 200 OK\r\n\r\n{\"status\":\"ok\",\"version\":\"0.4.0\",\"storage\":\"local-sqlite\"}";
        assert!(is_healthy_selenyx_response(http10_healthy));

        let unrelated =
            b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n{\"status\":\"ok\"}";
        assert!(!is_healthy_selenyx_response(unrelated));

        let blank_version = b"HTTP/1.1 200 OK\r\n\r\n{\"status\":\"ok\",\"version\":\"   \",\"storage\":\"local-sqlite\"}";
        assert!(!is_healthy_selenyx_response(blank_version));

        let wrong_storage = b"HTTP/1.1 200 OK\r\n\r\n{\"status\":\"ok\",\"version\":\"0.4.0\",\"storage\":\"postgres\"}";
        assert!(!is_healthy_selenyx_response(wrong_storage));
    }

    #[cfg(not(mobile))]
    #[test]
    fn non_success_or_incomplete_health_responses_are_not_reused() {
        let unavailable = b"HTTP/1.1 503 Service Unavailable\r\n\r\n{\"status\":\"ok\",\"version\":\"2\",\"storage\":\"local-sqlite\"}";
        assert!(!is_healthy_selenyx_response(unavailable));
        assert!(!is_healthy_selenyx_response(b"HTTP/1.1 200 OK\r\n"));
        assert!(!is_healthy_selenyx_response(b""));
    }

    #[cfg(not(mobile))]
    #[test]
    fn sidecar_starts_only_when_the_loopback_port_is_vacant() {
        assert_eq!(
            local_backend_start_action(LocalBackendProbe::HealthySelenyx),
            LocalBackendStartAction::ReuseHealthy
        );
        assert_eq!(
            local_backend_start_action(LocalBackendProbe::VacantPort),
            LocalBackendStartAction::SpawnSidecar
        );
        assert_eq!(
            local_backend_start_action(LocalBackendProbe::OccupiedOrUnhealthy),
            LocalBackendStartAction::LeaveUnavailable
        );
    }

    #[cfg(not(mobile))]
    #[test]
    fn a_bindable_loopback_port_is_vacant_even_when_connect_times_out() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        assert_eq!(
            super::vacant_or_occupied_port(address),
            LocalBackendProbe::OccupiedOrUnhealthy
        );
        drop(listener);
        assert_eq!(
            super::vacant_or_occupied_port(address),
            LocalBackendProbe::VacantPort
        );
    }

    #[cfg(not(mobile))]
    #[test]
    fn loopback_tcp_probe_distinguishes_healthy_unrelated_oversized_and_vacant_endpoints() {
        use std::io::{Read, Write};

        // 1. Healthy Selenyx HTTP listener -> HealthySelenyx -> ReuseHealthy
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut req = [0_u8; 256];
            let _ = stream.read(&mut req);
            stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"status\":\"ok\",\"version\":\"0.4.0\",\"storage\":\"local-sqlite\"}",
                )
                .unwrap();
        });
        let probe = probe_local_backend_at(addr);
        server.join().unwrap();
        assert_eq!(probe, LocalBackendProbe::HealthySelenyx);
        assert_eq!(
            local_backend_start_action(probe),
            LocalBackendStartAction::ReuseHealthy
        );

        // 2. Occupied by an unrelated HTTP service -> OccupiedOrUnhealthy -> LeaveUnavailable
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut req = [0_u8; 256];
            let _ = stream.read(&mut req);
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n{\"service\":\"other\"}")
                .unwrap();
        });
        let probe = probe_local_backend_at(addr);
        server.join().unwrap();
        assert_eq!(probe, LocalBackendProbe::OccupiedOrUnhealthy);
        assert_eq!(
            local_backend_start_action(probe),
            LocalBackendStartAction::LeaveUnavailable
        );

        // 3. Oversized payload exceeding MAX_HEALTH_RESPONSE_BYTES -> OccupiedOrUnhealthy
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut req = [0_u8; 256];
            let _ = stream.read(&mut req);
            let mut payload =
                b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n".to_vec();
            payload.resize(MAX_HEALTH_RESPONSE_BYTES + 512, b'x');
            let _ = stream.write_all(&payload);
        });
        assert_eq!(
            probe_local_backend_at(addr),
            LocalBackendProbe::OccupiedOrUnhealthy
        );
        server.join().unwrap();
    }

    #[cfg(not(mobile))]
    #[test]
    fn sidecar_slot_tracks_child_and_rejects_late_spawns_after_shutdown() {
        let mut slot = SidecarSlot::<u32>::default();
        assert!(!slot.is_shutting_down());
        assert_eq!(slot.attach(4100), Ok(None));
        assert_eq!(slot.attach(4200), Ok(Some(4100)));

        // First shutdown takes the active handle; repeat shutdowns are no-ops.
        assert_eq!(slot.take_for_shutdown(), Some(4200));
        assert!(slot.is_shutting_down());
        assert_eq!(slot.take_for_shutdown(), None);

        // Late background spawn after RunEvent::Exit must be rejected for immediate cleanup.
        assert_eq!(slot.attach(4300), Err(4300));
    }

    #[cfg(not(mobile))]
    #[test]
    fn production_sidecar_path_type_checks_in_test_build() {
        let _probe: fn() -> LocalBackendProbe = super::probe_local_backend;
        let _start: fn(&tauri::AppHandle) = super::start_local_backend;
        let _stop: fn(&tauri::AppHandle) = super::stop_local_backend;
    }
}
