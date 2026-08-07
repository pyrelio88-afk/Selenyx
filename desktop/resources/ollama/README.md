# Optional Ollama installer resource

`OllamaSetup.exe` is intentionally absent from source control. It is downloaded only by the explicit Windows packaging path:

```powershell
npm run desktop:build:with-ollama
```

The preparation script streams the upstream v0.32.6 installer, then requires its exact byte size and SHA-256 to match `manifest.json` before it is eligible for the Windows Tauri resource bundle. A normal `npm run desktop:build` does not download or package the installer.

The installer remains an upstream Ollama artifact. Review its applicable license and distribution terms before shipping it to users.
