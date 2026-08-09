//! 仙鹤桌宠：透明、置顶、无边框小窗，由 Rust 定时器驱动走位/飞行轨迹。
//!
//! 窗口内容（frontend/public/pet.html）只负责渲染与扑翼/步行动画；
//! 位移完全由本模块完成，因此 pet 窗口不需要任何 JS 窗口权限。
//! Linux/Wayland 对 transparent 支持不稳，创建失败时调用方降级为应用内漂浮鹤。
//! 仅桌面端：移动端 toggle_pet 返回明确错误。

#[cfg(not(mobile))]
use tauri::{LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};
#[cfg(mobile)]
use tauri::Manager;

pub const PET_LABEL: &str = "pet";
#[cfg(not(mobile))]
const PET_SIZE: f64 = 132.0;
#[cfg(not(mobile))]
const TICK_MS: u64 = 40;

/// 走位状态机：地面慢走（walk）与直线飞行（fly）交替，到达目标后重新选择。
#[cfg(not(mobile))]
struct PetMotion {
    x: f64,
    y: f64,
    target_x: f64,
    target_y: f64,
    speed: f64,
    flying: bool,
    max_x: f64,
    max_y: f64,
}

#[cfg(not(mobile))]
impl PetMotion {
    fn new(max_x: f64, max_y: f64) -> Self {
        let mut motion = Self {
            x: max_x * 0.7,
            y: max_y * 0.7,
            target_x: 0.0,
            target_y: 0.0,
            speed: 1.6,
            flying: false,
            max_x,
            max_y,
        };
        motion.pick_target();
        motion
    }

    fn pick_target(&mut self) {
        // 简单确定性随机（避免引入 rand 依赖）：以当前坐标搅拌
        let seed = (self.x * 7.13 + self.y * 3.71 + self.target_x * 1.37).abs();
        let r1 = (seed.sin() * 43758.5453_f64).fract().abs();
        let r2 = ((seed + 17.0).cos() * 24634.6345_f64).fract().abs();
        self.flying = r2 > 0.55;
        self.speed = if self.flying { 6.5 } else { 1.6 };
        self.target_x = (r1 * self.max_x).clamp(0.0, self.max_x);
        self.target_y = if self.flying {
            (r2 * self.max_y * 0.5).clamp(0.0, self.max_y) // 飞行偏上半屏
        } else {
            (self.max_y - 8.0).max(0.0) // 步行贴底
        };
    }

    /// 前进一步；到达目标后换招。返回值 = 是否仍在向目标移动。
    fn step(&mut self) {
        let dx = self.target_x - self.x;
        let dy = self.target_y - self.y;
        let dist = (dx * dx + dy * dy).sqrt();
        if dist < self.speed * 1.5 {
            self.pick_target();
            return;
        }
        self.x += dx / dist * self.speed;
        self.y += dy / dist * self.speed;
        self.x = self.x.clamp(0.0, self.max_x);
        self.y = self.y.clamp(0.0, self.max_y);
    }
}

#[cfg(not(mobile))]
fn spawn_pet_motion(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut motion: Option<PetMotion> = None;
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(TICK_MS)).await;
            let Some(window) = app.get_webview_window(PET_LABEL) else {
                return; // 窗口已关，协程退出
            };
            if motion.is_none() {
                let (max_x, max_y) = window
                    .current_monitor()
                    .ok()
                    .flatten()
                    .map(|monitor| {
                        let size = monitor.size();
                        let scale = monitor.scale_factor();
                        (
                            (size.width as f64 / scale - PET_SIZE).max(0.0),
                            (size.height as f64 / scale - PET_SIZE).max(0.0),
                        )
                    })
                    .unwrap_or((1024.0, 640.0));
                motion = Some(PetMotion::new(max_x, max_y));
            }
            let state = motion.as_mut().expect("motion just initialized");
            state.step();
            if window
                .set_position(LogicalPosition::new(state.x, state.y))
                .is_err()
            {
                return;
            }
        }
    });
}

#[cfg(not(mobile))]
fn open_pet(app: &tauri::AppHandle) -> Result<(), String> {
    let window = WebviewWindowBuilder::new(app, PET_LABEL, WebviewUrl::App("pet.html".into()))
        .title("Selenyx 仙鹤")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .inner_size(PET_SIZE, PET_SIZE)
        .build()
        .map_err(|error| format!("桌宠窗口创建失败：{error}"))?;
    window.set_focusable(false).ok(); // 不抢焦点
    spawn_pet_motion(app.clone());
    Ok(())
}

/// 切换桌宠显隐；visible=None 时取反。返回调用后的可见状态。
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
                window.close().map_err(|error| format!("桌宠关闭失败：{error}"))?;
                Ok(false)
            }
            (true, None) => {
                open_pet(&app)?;
                Ok(true)
            }
        }
    }
}
