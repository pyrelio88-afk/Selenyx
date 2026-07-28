# 桌面端打不开 / 不能用

## 已确认根因（本机 2026-07-28）

Windows **Smart App Control（智能应用控制）** 处于强制模式：

- 注册表：`VerifiedAndReputablePolicyState = 1`
- 直接启动未签名 `Selenyx.exe` → `WinError 4551 应用程序控制策略已阻止此文件`
- 表现：双击安装版/快捷方式无窗口或一闪而过，像“不能用”

这不是业务代码白屏，而是 **系统策略拦截未签名安装包**。

## 立刻可用的启动方式

桌面双击：

- `Selenyx-可用启动.bat`
- 或 `Selenyx.lnk`（已改写为上述启动通道）

等价命令：

```bat
cd C:\Users\34043\Documents\Codex\2026-07-25\ni\selenyx-r06\desktop
node_modules\electron\dist\electron.exe .
```

## 已验证（rc.5 开发通道）

- health.ok = true, version = 0.8.0-rc.5
- 检索 `CRISPR gene editing` → 30 条可收藏记录
- runtime-badge ready

## 若仍要使用安装版 .exe

1. Windows 安全中心 → 应用和浏览器控制 → 智能应用控制 → 关闭或改评估模式  
2. 或对 `Selenyx.exe` 添加企业签名（当前包未签名）  
3. 再运行 `desktop\release\Selenyx-0.8.0-rc.5-windows-x64-setup.exe`

## 功能使用提示

- 真检索：左侧「文献检索」→ 切到 **国际聚合** → 搜关键词  
- 浏览器：arXiv / PubScholar / PubMed 优先内嵌；知网/万方/NSTL 等默认系统浏览器  
- 收藏：检索卡片「收藏」或浏览器工具栏「收藏当前页」
