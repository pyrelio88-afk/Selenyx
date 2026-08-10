//! 仙鹤桌宠：透明、置顶、无边框小窗，由 Rust 定时器驱动位移。
//!
//! 行为模型（与用户约定）：平时趴在主窗聊天框上沿（跟随主窗移动），
//! 点击飞起来绕一圈再落回；右键收起。run 完成时前端可 emit `pet:celebrate`
//! 让它飞一圈报喜（模块 G 复用同一通路）。
//!
//! 窗口内容（frontend/public/pet.html）只负责渲染与姿态动画（依窗口移动速度
//! 自动切换趴/飞姿态），位移全部由本模块完成，因此 pet 窗口只需要
//! `core:event:allow-emit` 一条权限（capabilities/pet.json）。
//! Linux/Wayland 对 transparent 支持不稳，创建失败时调用方降级为应用内漂浮鹤。

#[cfg(not(mobile))]
use std::collections::VecDeque;
#[cfg(not(mobile))]
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Once,
};
#[cfg(not(mobile))]
use tauri::{Listener, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};
#[cfg(mobile)]
use tauri::Manager;

pub const PET_LABEL: &str = "pet";
const MAIN_LABEL: &str = "main";
#[cfg(not(mobile))]
const PET_SIZE: f64 = 132.0;
#[cfg(not(mobile))]
const TICK_MS: u64 = 40;
/// 聊天输入区近似高度：趴点 = 主窗底边 − 输入区高 − 宠物窗高 + 交叠
#[cfg(not(mobile))]
const COMPOSER_H: f64 = 150.0;
#[cfg(not(mobile))]
const PERCH_RIGHT_MARGIN: f64 = 56.0;
#[cfg(not(mobile))]
const PERCH_OVERLAP: f64 = 14.0;

#[cfg(not(mobile))]
static FLY_REQUESTED: AtomicBool = AtomicBool::new(false);
#[cfg(not(mobile))]
static LISTEN_ONCE: Once = Once::new();

/// 走位状态：趴窝（跟随主窗聊天框）或沿航点飞行（飞完自动回巢）。
#[cfg(not(mobile))]
enum PetState {
    Perched,
    Flying { waypoints: VecDeque<(f64, f64)> },
}

#[cfg(not(mobile))]
struct PetMotion {
    x: f64,
    y: f64,
    state: PetState,
    max_x: f64,
    max_y: f64,
}

#[cfg(not(mobile))]
impl PetMotion {
    fn new(max_x: f64, max_y: f64) -> Self {
        Self {
            x: max_x * 0.7,
            y: max_y * 0.7,
            state: PetState::Perched,
            max_x,
            max_y,
        }
    }

    /// 确定性伪随机（避免 rand 依赖）：以当前坐标搅拌。
    fn rand_pair(&self, salt: f64) -> (f64, f64) {
        let seed = (self.x * 7.13 + self.y * 3.71 + salt).abs();
        let r1 = (seed.sin() * 43758.5453_f64).fract().abs();
        let r2 = ((seed + 17.0).cos() * 24634.6345_f64).fract().abs();
        (r1, r2)
    }

    /// 规划一圈飞行航点：先拉升，再在屏幕上半部游 2-3 点。
    fn plan_flight(&self) -> VecDeque<(f64, f64)> {
        let mut points = VecDeque::new();
        points.push_back((self.x, (self.y - 260.0).max(24.0)));
        for i in 0..3 {
            let (r1, r2) = self.rand_pair(i as f64 * 31.7 + 5.0);
            points.push_back((
                (r1 * self.max_x).clamp(0.0, self.max_x),
                (r2 * self.max_y * 0.55).clamp(0.0, self.max_y),
            ));
        }
        points
    }

    fn step(&mut self, perch: (f64, f64)) {
        // 飞完一圈回巢：飞行结束标志在 match 外落笔，绕开自赋值借用冲突
        let finished_flight = match &mut self.state {
            PetState::Perched => {
                let dx = perch.0 - self.x;
                let dy = perch.1 - self.y;
                let dist = (dx * dx + dy * dy).sqrt();
                if dist < 2.0 {
                    self.x = perch.0;
                    self.y = perch.1;
                } else {
                    // 跟随主窗：距离越远滑得越快，贴近时减速落稳
                    let speed = (dist / 10.0).clamp(1.4, 7.0);
                    self.x += dx / dist * speed;
                    self.y += dy / dist * speed;
                }
                false
            }
            PetState::Flying { waypoints } => {
                const FLY_SPEED: f64 = 7.5;
                if let Some(&(tx, ty)) = waypoints.front() {
                    let dx = tx - self.x;
                    let dy = ty - self.y;
                    let dist = (dx * dx + dy * dy).sqrt();
                    if dist < FLY_SPEED * 1.5 {
                        waypoints.pop_front();
                    } else {
                        self.x += dx / dist * FLY_SPEED;
                        self.y += dy / dist * FLY_SPEED;
                    }
                }
                waypoints.is_empty()
            }
        };
        if finished_flight {
            self.state = PetState::Perched;
        }
        self.x = self.x.clamp(0.0, self.max_x);
        self.y = self.y.clamp(0.0, self.max_y);
    }
}

/// 计算趴点：主窗聊天框上沿偏右；主窗最小化/不可用时退到屏幕右下角。
#[cfg(not(mobile))]
fn perch_position(app: &tauri::AppHandle, max_x: f64, max_y: f64) -> (f64, f64) {
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        let minimized = main.is_minimized().unwrap_or(false);
        let visible = main.is_visible().unwrap_or(true);
        if !minimized && visible {
            if let (Ok(pos), Ok(size)) = (main.outer_position(), main.outer_size()) {
                let scale = main.scale_factor().unwrap_or(1.0);
                let (mx, my) = (pos.x as f64 / scale, pos.y as f64 / scale);
                // 最小化时 Windows 报 -32000，直接当不可用处理
                if mx > -10000.0 {
                    let (mw, mh) = (size.width as f64 / scale, size.height as f64 / scale);
                    let px = mx + mw - PET_SIZE - PERCH_RIGHT_MARGIN;
                    let py = my + mh - COMPOSER_H - PET_SIZE + PERCH_OVERLAP;
                    return (px.clamp(0.0, max_x), py.clamp(0.0, max_y));
                }
            }
        }
    }
    ((max_x - 24.0).max(0.0), (max_y - 24.0).max(0.0))
}

/// 注册一次性的全局事件监听：点击求飞 / 右键收起 / run 完成报喜。
#[cfg(not(mobile))]
fn register_pet_events(app: &tauri::AppHandle) {
    LISTEN_ONCE.call_once(|| {
        app.listen("pet:clicked", |_| {
            FLY_REQUESTED.store(true, Ordering::Relaxed);
        });
        app.listen("pet:celebrate", |_| {
            FLY_REQUESTED.store(true, Ordering::Relaxed);
        });
        let app_for_hide = app.clone();
        app.listen("pet:hide", move |_| {
            if let Some(window) = app_for_hide.get_webview_window(PET_LABEL) {
                let _ = window.close();
            }
        });
    });
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
            if FLY_REQUESTED.swap(false, Ordering::Relaxed) {
                if matches!(state.state, PetState::Perched) {
                    state.state = PetState::Flying {
                        waypoints: state.plan_flight(),
                    };
                }
            }
            let perch = perch_position(&app, state.max_x, state.max_y);
            state.step(perch);
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
    window.set_focusable(false).ok(); // 不抢焦点（点击仍可到达 webview）
    register_pet_events(app);
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
