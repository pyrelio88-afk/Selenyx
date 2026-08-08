# Optional Ollama installer resource

`OllamaSetup.exe` is intentionally absent from source control. It is downloaded only by the explicit Windows packaging path:

```powershell
npm run desktop:build:offline-pack
```

The preparation script streams the pinned installer, then requires its exact byte size and SHA-256 to match `manifest.json` before it is eligible for the explicit Windows offline capability bundle. That bundle also selects Tauri's WebView2 offline prerequisite, but it includes no AI model weights. A normal `npm run desktop:build` uses the small WebView2 download bootstrapper and does not download or package the Ollama installer. Selenyx only reveals the verified file in Windows Explorer and never runs the installer itself.

The installer is an upstream Ollama artifact. Review its applicable license and distribution terms before shipping it to users.
