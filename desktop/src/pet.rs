//! Calm crane companion window.
//!
//! The companion deliberately stays put near the main composer's lower edge
//! (or in the lower-right corner when no main window is available).  Status
//! bubbles, the pending-evidence dot, and the context menu live in
//! `frontend/public/pet.html`; Rust only owns native placement, visibility,
//! and the one action that must leave the pet window (showing the main app).

#[cfg(not(mobile))]
use std::sync::Once;
#[cfg(not(mobile))]
use tauri::{Listener, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};

pub const PET_LABEL: &str = "pet";
const MAIN_LABEL: &str = "main";
#[cfg(not(mobile))]
const PET_SIZE: f64 = 164.0;
/// Approximate main-window composer height.  The pet is only placed once on
/// open, so it feels like a quiet companion rather than a moving overlay.
#[cfg(not(mobile))]
const COMPOSER_H: f64 = 154.0;
#[cfg(not(mobile))]
const PERCH_RIGHT_MARGIN: f64 = 42.0;
#[cfg(not(mobile))]
const PERCH_OVERLAP: f64 = 8.0;

#[cfg(not(mobile))]
static LISTEN_ONCE: Once = Once::new();

/// Initial perch: just above the chat composer where possible, otherwise a
/// conservative lower-right desktop position.  We intentionally do not clamp
/// to the primary monitor: a main window on a secondary/negative-coordinate
/// monitor should keep its companion beside it.
#[cfg(not(mobile))]
fn initial_pet_position(app: &tauri::AppHandle) -> LogicalPosition<f64> {
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        let minimized = main.is_minimized().unwrap_or(false);
        let visible = main.is_visible().unwrap_or(true);
        if !minimized && visible {
            if let (Ok(position), Ok(size)) = (main.outer_position(), main.outer_size()) {
                let scale = main.scale_factor().unwrap_or(1.0);
                let (x, y) = (position.x as f64 / scale, position.y as f64 / scale);
                // Windows reports a sentinel near -32000 for minimized windows.
                if x > -10000.0 {
                    return LogicalPosition::new(
                        x + size.width as f64 / scale - PET_SIZE - PERCH_RIGHT_MARGIN,
                        y + size.height as f64 / scale - COMPOSER_H - PET_SIZE + PERCH_OVERLAP,
                    );
                }
            }
        }
    }

    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let size = monitor.size();
        return LogicalPosition::new(
            (size.width as f64 / scale - PET_SIZE - 28.0).max(0.0),
            (size.height as f64 / scale - PET_SIZE - 44.0).max(0.0),
        );
    }
    LogicalPosition::new(860.0, 520.0)
}

/// Process pet-originated actions once for the life of the app.  State data
/// (`pet:state`, `pet:celebrate`, `pet:summary`) is delivered directly between
/// webviews through Tauri's event bus, avoiding native state duplication.
#[cfg(not(mobile))]
fn register_pet_events(app: &tauri::AppHandle) {
    LISTEN_ONCE.call_once(|| {
        let app_for_hide = app.clone();
        app.listen("pet:hide", move |_| {
            if let Some(window) = app_for_hide.get_webview_window(PET_LABEL) {
                let _ = window.close();
            }
        });

        let app_for_show = app.clone();
        app.listen("pet:show-main", move |_| {
            if let Some(main) = app_for_show.get_webview_window(MAIN_LABEL) {
                let _ = main.show();
                let _ = main.unminimize();
                let _ = main.set_focus();
            }
        });
    });
}

#[cfg(not(mobile))]
fn open_pet(app: &tauri::AppHandle) -> Result<(), String> {
    register_pet_events(app);
    let window = WebviewWindowBuilder::new(app, PET_LABEL, WebviewUrl::App("pet.html".into()))
        .title("Selenyx 仙鹤伙伴")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .inner_size(PET_SIZE, PET_SIZE)
        .build()
        .map_err(|error| format!("桌宠窗口创建失败：{error}"))?;
    // The HTML uses Tauri's drag-region attribute for intentional dragging;
    // otherwise the window is passive and never steals keyboard focus.
    window.set_focusable(false).ok();
    window
        .set_position(initial_pet_position(app))
        .map_err(|error| format!("桌宠定位失败：{error}"))?;
    Ok(())
}

/// Toggle the native companion window. `visible=None` keeps the legacy
/// command behaviour (invert the current state); the frontend always passes a
/// boolean so all three UI switches share one Zustand source of truth.
#[tauri::command]
pub fn toggle_pet(app: tauri::AppHandle, visible: Option<bool>) -> Result<bool, String> {
    #[cfg(mobile)]
    {
        let _ = (app, visible);
        Err("仙鹤桌宠仅桌面端可用。".to_string())
    }
    #[cfg(not(mobile))]
    {
        let existing = app.get_webview_window(PET_LABEL);
        let want = visible.unwrap_or(existing.is_none());
        match (want, existing) {
            (true, Some(_)) => Ok(true),
            (false, None) => Ok(false),
            (false, Some(window)) => {
                window
                    .close()
                    .map_err(|error| format!("桌宠关闭失败：{error}"))?;
                Ok(false)
            }
            (true, None) => {
                open_pet(&app)?;
                Ok(true)
            }
        }
    }
}
