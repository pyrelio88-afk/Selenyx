# Selenyx 桌面端 & Android 构建/安装指南

Selenyx 桌面端基于 **Tauri v2**：一套 Rust 壳 + 同一份 React/Vite 前端，编译出 **Windows / macOS / Linux 桌面原生安装包** 和 **Android APK**。应用完全在本地运行，不依赖任何协作平台基础设施。

> 目录约定：`desktop/` = Tauri 工程根（`tauri.conf.json` / `Cargo.toml` / `src/`），`frontend/` = React19+Vite 前端，`frontend/dist/` = 构建产物（Tauri 的 `frontendDist`）。

---

## 一、本地开发（dev 热重载）

```bash
# 仓库根目录
npm install               # 安装前端依赖
npm run dev               # 等价 cd frontend && vite（仅前端，浏览器 5173）
# 桌面端热重载（前端 + Rust 壳一起跑）：
cd desktop && cargo tauri dev
```

`cargo tauri dev` 会自动跑 `beforeDevCommand`（`npm --prefix ../frontend run dev`）拉起 Vite，再用系统 webview 打开桌面窗口，Rust 改动自动重编译。

---

## 二、本地构建安装包（release）

### 前置：系统依赖

| 平台 | 一次性安装的系统依赖 |
|------|---------------------|
| **Linux (Ubuntu/Debian)** | `sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev build-essential curl wget file patchelf` |
| **macOS** | Xcode Command Line Tools：`xcode-select --install` |
| **Windows** | Microsoft Edge WebView2（Win11 已自带；Win10 装 [Evergreen Bootstrapper](https://developer.microsoft.com/microsoft-edge/webview2/)）；MSVC 工具链（VS Build Tools） |

Rust 工具链：`curl https://sh.rustup.rs -sSf | sh`（stable）。Tauri CLI：`cargo install tauri-cli --version "^2"`。

### 构建

```bash
# 仓库根目录
npm install
cd desktop
cargo tauri build          # 产出当前平台全部包
# 指定包类型：
cargo tauri build --bundles deb,appimage      # Linux
cargo tauri build --bundles msi,nsis          # Windows（msi=WiX, nsis=传统安装器）
cargo tauri build --bundles dmg,app           # macOS
```

产物路径：`desktop/target/release/bundle/`

| 平台 | 产物 | 安装方式 |
|------|------|----------|
| Linux | `Selenyx_2.0.0-alpha_amd64.deb` / `.AppImage` / `.rpm` | deb：`sudo dpkg -i *.deb`；AppImage：`chmod +x *.AppImage && ./*.AppImage` |
| Windows | `Selenyx_2.0.0-alpha_x64-setup.exe`（NSIS）/ `*_x64_en-US.msi`（WiX） | 双击安装 |
| macOS | `Selenyx_2.0.0-alpha_aarch64.dmg` / `.app` | dmg 拖入 Applications |

> macOS 首次打开未签名 .app 会提示"无法验证开发者"：右键 → 打开 → 仍要打开。正式分发需 Apple Developer 证书签名（见下"签名"）。

---

## 三、CI 自动构建（推荐出包方式）

仓库内已配两个 GitHub Actions 工作流（`.github/workflows/`）：

- **`release-tauri.yml`**：`ubuntu-22.04 / windows-latest / macos-latest` 三 runner 矩阵，用 `tauri-apps/tauri-action` 一键产出 deb/AppImage/rpm/msi/nsis/dmg，附到 GitHub Release（草稿）+ 上传 artifact。
- **`build-android.yml`**：`ubuntu-22.04`，装 JDK17 + Android SDK/NDK + Rust android targets，`tauri android init` → `tauri android build --apk --split-per-abi`，产出 arm64/armv7 APK。

### 触发方式

1. **打标签发版**：`git tag v2.0.0-alpha && git push origin v2.0.0-alpha` → 两个工作流同时跑，产物进 Release 草稿。
2. **手动运行**：GitHub 仓库 → Actions 页 → 选工作流 → Run workflow。

### 启用步骤（仓库目前无 GitHub remote）

```bash
# 1. 在 GitHub 建空仓库 selenyx（不要勾 README）
# 2. 关联并首次推送（用户允许发布后）
git remote add origin git@github.com:<你>/selenyx.git
git push -u origin main          # 或 sprint/default
# 3. 打标签触发构建
git tag v2.0.0-alpha
git push origin v2.0.0-alpha
# 4. Actions 跑完 → Releases 页拿安装包；或 Actions → 产物 artifact 下载
```

---

## 四、Android APK 构建

### 本地构建

```bash
# 前置：JDK17、Android SDK（platform-tools; platforms;android-34; build-tools;34.0.0; ndk;27.0.12077973）
#       设 ANDROID_HOME / NDK_HOME；Rust android targets：
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android

cd desktop
cargo tauri android init          # 首次：生成 gen/android 工程骨架
cargo tauri android build --apk --split-per-abi   # 产出 APK
```

产物：`desktop/gen/android/app/build/outputs/apk/<abi>/release/app-<abi>-release-unsigned.apk`

> release APK 默认未签名。正式上架需生成 keystore 并在 `gen/android/app/build.gradle.kts` 配签名；调试可直接 `tauri android build --apk --debug` 出已签名 debug 包安装测试。

### CI 构建

见上 `build-android.yml`，手动 Run workflow 即出 APK artifact，无需本地配环境。

### 安装到手机

```bash
adb install -r app-arm64-v8a-release-unsigned.apk   # 或传到手机点装（需开启"未知来源"）
```

---

## 五、原生能力说明

| 能力 | 浏览器/WASM 版 | Tauri 原生版 |
|------|----------------|--------------|
| 数据持久化 | localStorage（浏览器，上限~5MB） | webview localStorage 自动持久化到应用数据目录（不丢）+ `tauri-plugin-store` 结构化键值 + `export_state/import_state` 原生命令备份到 `~/.selenyx/` |
| OCR | Tesseract.js (WASM, CDN 懒加载) | 桌面端复用同一实现；后续可迁 Rust 侧 ONNX Runtime（见下） |
| 文档转 Markdown | @firecrawl/anydoc-wasm (WASM) | 同上，桌面端直接跑；后续可换 Rust 原生 |
| 文件访问 | 受浏览器沙箱限制 | `tauri-plugin-fs` 直读 `~/.selenyx/`、`$DOCUMENT` |

**已暴露的原生命令**（前端经 `window.__TAURI__.core.invoke('xxx')` 调用，`withGlobalTauri:true` 已开启，无需前端重新打包即可用）：
- `export_state(json)` → 备份整份状态到 `~/.selenyx/selenyx-state-backup.json`
- `import_state()` → 读回备份
- `app_data_dir()` → 返回数据目录路径

**OCR/anydoc 迁 Rust 侧路线**（后续迭代）：用 `ort`（ONNX Runtime Rust 绑定）+ PaddleOCR/RapidOCR ONNX 模型，在 Rust 侧推理，前端经 Tauri command 调用——彻底摆脱浏览器 WASM 体积与 CDN 依赖，Android 端也能用。当前先用既有 WASM 实现保证可用。

---

## 六、签名与分发（正式发布）

- **Windows**：用代码签名证书（EV/OV）配 `tauri.conf.json` → `bundle.windows.certificateThumbprint` / 设环境变量 `TAURI_SIGNING_PRIVATE_KEY`，避免 SmartScreen 拦截。
- **macOS**：Apple Developer 证书 + `bundle.macOS.signingIdentity`；DMG 公证 `tauri build` 会自动跑 `codesign`/`xcrun notarytool`（需 `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` 环境变量）。
- **Android**：生成 keystore，在 `gen/android/app/build.gradle.kts` 配 `signingConfigs.release`，或用 `tauri android build --apk --signing-key ...`。

---

## 七、为什么不在沙箱里直接出 Linux 包

本任务执行沙箱为 **1 核 / 4GB / 无 root** 的容器：Tauri Linux 构建硬依赖系统库 `libwebkit2gtk-4.1`、`librsvg2`、`libsoup-3.0`，安装需 `apt-get`（root），而沙箱 `sudo` 被 `no-new-privileges` 策略禁用；Android init 需 JDK（同理无法装）。因此**真实安装包统一由 GitHub Actions 在合规 runner 上构建**——这也是任务简报为 Windows/macOS 指定的正解，此处扩展到全平台。沙箱内已完成的验证：Tauri 工程配置经 `tauri info` 校验通过、前端成品 SPA 渲染截图（见交付）。
