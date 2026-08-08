// Selenyx 桌面端库 — Tauri v2
// 桌面 (Windows/macOS/Linux) + 移动端 (Android/iOS) 共用入口
//
// 原生能力：
//  - 启动时创建数据目录 ~/.selenyx/{projects,attachments,exports}
//  - tauri-plugin-store：结构化键值持久化（供前端按需迁移大数据，告别浏览器存储上限）
//  - export_state / import_state：把整份应用状态 JSON 备份到 ~/.selenyx/ 或从备份恢复
//  - webview localStorage 在各平台默认持久化到应用数据目录，桌面端数据不丢

use serde::Deserialize;
use std::fs;
use std::io::{ErrorKind, Write};
use tauri::Manager;

#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
use tauri_plugin_shell::ShellExt;

#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
use std::io::Read;
#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
use std::net::{SocketAddr, TcpStream};
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
const BUNDLED_OLLAMA_INSTALLER_BYTES: u64 = 1_563_278_432;

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
fn probe_local_backend() -> LocalBackendProbe {
    let address: SocketAddr = LOCAL_BACKEND_ADDR
        .parse()
        .expect("the fixed loopback backend address must parse");
    let mut stream = match TcpStream::connect_timeout(&address, HEALTH_PROBE_TIMEOUT) {
        Ok(stream) => stream,
        Err(error) if error.kind() == ErrorKind::ConnectionRefused => {
            return LocalBackendProbe::VacantPort;
        }
        Err(_) => return LocalBackendProbe::OccupiedOrUnhealthy,
    };

    if stream.set_read_timeout(Some(HEALTH_PROBE_TIMEOUT)).is_err()
        || stream
            .set_write_timeout(Some(HEALTH_PROBE_TIMEOUT))
            .is_err()
    {
        return LocalBackendProbe::OccupiedOrUnhealthy;
    }
    if stream
        .write_all(
            b"GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:8770\r\nAccept: application/json\r\nConnection: close\r\n\r\n",
        )
        .is_err()
    {
        return LocalBackendProbe::OccupiedOrUnhealthy;
    }

    match read_limited_health_response(&mut stream) {
        Some(response) if is_healthy_selenyx_response(&response) => {
            LocalBackendProbe::HealthySelenyx
        }
        _ => LocalBackendProbe::OccupiedOrUnhealthy,
    }
}

/// Production desktop bundles include a frozen FastAPI sidecar. Development
/// starts the same service through `npm run dev:local`, while mobile clients
/// deliberately do not attempt to spawn desktop executables.
#[cfg(all(not(mobile), any(not(debug_assertions), test)))]
fn start_local_backend(app: &tauri::AppHandle) {
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
            if let Err(error) = command.spawn() {
                eprintln!("Unable to start the local backend sidecar: {error}");
            }
        }
    }
}

/// 取数据目录 ~/.selenyx/
fn data_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    let home = app
        .path()
        .home_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
    home.join(".selenyx")
}

fn state_backup_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    data_dir(app).join("selenyx-state-backup.json")
}

fn validate_state_backup_json(json: &str) -> Result<(), String> {
    if json.len() as u64 > MAX_STATE_BACKUP_BYTES {
        return Err("State backup is too large".to_string());
    }
    match serde_json::from_str::<serde_json::Value>(json) {
        Ok(serde_json::Value::Object(_)) => Ok(()),
        Ok(_) => Err("State backup must be a JSON object".to_string()),
        Err(_) => Err("State backup is not valid JSON".to_string()),
    }
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

#[cfg(not(mobile))]
fn bundled_ollama_installer_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    if !cfg!(target_os = "windows") {
        return None;
    }
    let resource_dir = app.path().resource_dir().ok()?;
    [
        resource_dir.join("resources/ollama/OllamaSetup.exe"),
        resource_dir.join("ollama/OllamaSetup.exe"),
    ]
    .into_iter()
    .find(|path| {
        path.is_file()
            && fs::metadata(path)
                .map(|metadata| metadata.len() == BUNDLED_OLLAMA_INSTALLER_BYTES)
                .unwrap_or(false)
    })
}

/// Lets the Settings screen distinguish an ordinary small bundle from the
/// explicit Windows --with-ollama flavor without attempting to open anything.
#[tauri::command]
fn has_bundled_ollama_installer(app: tauri::AppHandle) -> bool {
    #[cfg(mobile)]
    {
        let _ = app;
        false
    }

    #[cfg(not(mobile))]
    {
        bundled_ollama_installer_path(&app).is_some()
    }
}

/// Reveal the opt-in upstream installer in Explorer. Selenyx deliberately does
/// not execute it: installation requires a separate, explicit user action.
#[tauri::command]
fn reveal_bundled_ollama_installer(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(any(mobile, not(target_os = "windows")))]
    {
        let _ = app;
        Err("The bundled Ollama installer is available only on Windows desktop builds.".to_string())
    }

    #[cfg(all(not(mobile), target_os = "windows"))]
    {
        let installer = bundled_ollama_installer_path(&app).ok_or_else(|| {
            "This Selenyx build does not include a verified optional Ollama installer.".to_string()
        })?;
        let mut explorer_selection = std::ffi::OsString::from("/select,");
        explorer_selection.push(installer.as_os_str());
        std::process::Command::new("explorer.exe")
            .arg(explorer_selection)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Unable to reveal the bundled Ollama installer: {error}"))
    }
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
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            export_state,
            import_state,
            delete_state_backup,
            app_data_dir,
            has_bundled_ollama_installer,
            reveal_bundled_ollama_installer,
            save_llm_config
        ])
        .setup(|app| {
            // 创建数据目录 ~/.selenyx/
            let home = app.path().home_dir().expect("无法获取 HOME 目录");
            let data_dir = home.join(".selenyx");
            fs::create_dir_all(&data_dir).ok();
            fs::create_dir_all(data_dir.join("projects")).ok();
            fs::create_dir_all(data_dir.join("attachments")).ok();
            fs::create_dir_all(data_dir.join("exports")).ok();

            #[cfg(all(not(mobile), not(debug_assertions)))]
            start_local_backend(app.handle());

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

#[cfg(test)]
mod tests {
    use super::{
        merge_local_llm_config, upsert_env_value, validate_env_value, validate_state_backup_json,
        write_state_backup_atomically,
    };
    use std::fs;

    #[cfg(not(mobile))]
    use super::{
        is_healthy_selenyx_response, local_backend_start_action, LocalBackendProbe,
        LocalBackendStartAction,
    };

    #[test]
    fn local_llm_values_reject_multiline_injection() {
        assert!(validate_env_value("API key", "safe-value\nOTHER=value", true).is_err());
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
        assert!(validate_state_backup_json(r#"{"schemaVersion":2}"#).is_ok());
        assert!(validate_state_backup_json("[]").is_err());
        assert!(validate_state_backup_json("not json").is_err());
    }

    #[test]
    fn state_backup_atomic_write_replaces_a_complete_snapshot() {
        let directory =
            std::env::temp_dir().join(format!("selenyx-state-test-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("state.json");
        fs::write(&path, r#"{"old":true}"#).unwrap();
        write_state_backup_atomically(&path, r#"{"new":true}"#).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"new":true}"#);
        fs::remove_dir_all(&directory).unwrap();
    }

    #[cfg(not(mobile))]
    #[test]
    fn only_a_real_selenyx_health_payload_is_reusable() {
        let healthy = b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n{\"status\":\"ok\",\"version\":\"0.0.1\",\"storage\":\"local-sqlite\"}";
        assert!(is_healthy_selenyx_response(healthy));

        let unrelated =
            b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n{\"status\":\"ok\"}";
        assert!(!is_healthy_selenyx_response(unrelated));
    }

    #[cfg(not(mobile))]
    #[test]
    fn non_success_or_incomplete_health_responses_are_not_reused() {
        let unavailable = b"HTTP/1.1 503 Service Unavailable\r\n\r\n{\"status\":\"ok\",\"version\":\"2\",\"storage\":\"local-sqlite\"}";
        assert!(!is_healthy_selenyx_response(unavailable));
        assert!(!is_healthy_selenyx_response(b"HTTP/1.1 200 OK\r\n"));
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
    fn production_sidecar_path_type_checks_in_test_build() {
        let _probe: fn() -> LocalBackendProbe = super::probe_local_backend;
        let _start: fn(&tauri::AppHandle) = super::start_local_backend;
    }
}
