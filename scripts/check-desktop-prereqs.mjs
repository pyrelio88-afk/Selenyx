import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

// Read-only preflight for the complete local desktop build. It never installs
// software, resolves dependencies, or downloads optional resources.
const environment = { ...process.env };
const requestedRoot = resolve(import.meta.dirname, '..');
const root = realpathSync.native(requestedRoot);
const desktopDirectory = join(root, 'desktop');
if (platform() === 'win32') {
  const cargoBin = join(homedir(), '.cargo', 'bin');
  if (existsSync(join(cargoBin, 'rustc.exe'))) {
    const currentPath = environment.PATH ?? environment.Path ?? '';
    environment.PATH = `${cargoBin}${delimiter}${currentPath}`;
    environment.Path = environment.PATH;
  }
}

function hasCommand(command, args = [], cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    env: environment,
  });
  return !result.error && result.status === 0;
}

const missing = [];
const hasRust = hasCommand('rustc', ['-vV']);
if (!hasRust) missing.push('Rust stable toolchain (rustc / cargo)');
if (!hasCommand('uv', ['--version'])) missing.push('uv (Python environment and sidecar packager)');
if (
  hasRust
  && !hasCommand(
    'cargo',
    ['metadata', '--locked', '--offline', '--no-deps', '--format-version', '1'],
    desktopDirectory,
  )
) {
  missing.push('Cargo.lock is stale or its locked dependency metadata is unavailable offline');
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid ${label} JSON (${filePath}): ${error instanceof Error ? error.message : error}`);
  }
}

function flattenedResources(config) {
  const resources = config?.bundle?.resources ?? [];
  if (Array.isArray(resources)) return resources.map(String);
  if (resources && typeof resources === 'object') {
    return [...Object.keys(resources), ...Object.values(resources).map(String)];
  }
  throw new Error('Tauri bundle.resources must be an array or path mapping.');
}

function referencesOllama(config) {
  return flattenedResources(config).some((resource) => /(^|[\\/])ollama([\\/]|$)|OllamaSetup\.exe$/i.test(resource));
}

function referencesAiModelOrInstaller(config) {
  return flattenedResources(config).some((resource) => (
    /(^|[\\/])models?([\\/]|$)/i.test(resource)
    || /\.(exe|msi|msix|gguf|safetensors|onnx)$/i.test(resource)
  ));
}

function verifyAiResourceBoundary() {
  const baseConfigPath = join(desktopDirectory, 'tauri.conf.json');
  const overlayPath = join(desktopDirectory, 'tauri.offline-pack.conf.json');
  const capabilityPath = join(desktopDirectory, 'capabilities', 'default.json');
  const baseConfig = readJson(baseConfigPath, 'base Tauri config');
  const overlay = readJson(overlayPath, 'opt-in offline-pack Tauri overlay');
  const capability = readJson(capabilityPath, 'default desktop capability');

  if (referencesOllama(baseConfig) || referencesAiModelOrInstaller(baseConfig)) {
    throw new Error('The base Tauri config must never include optional AI models or installer resources.');
  }
  const defaultWebViewMode = baseConfig?.bundle?.windows?.webviewInstallMode?.type;
  if (defaultWebViewMode === 'offlineInstaller' || defaultWebViewMode === 'fixedRuntime') {
    throw new Error('The default Tauri bundle must not embed a large WebView2 installer or runtime.');
  }
  if (baseConfig?.plugins?.shell?.open || capability?.permissions?.includes('shell:allow-open')) {
    throw new Error('The WebView must not receive shell-open permission; installers are reveal-only native resources.');
  }

  const automaticallyMergedConfigs = readdirSync(desktopDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^tauri\.(windows|linux|macos)\.conf\.(json|json5|toml)$/i.test(entry.name));
  for (const entry of automaticallyMergedConfigs) {
    const filePath = join(desktopDirectory, entry.name);
    if (
      entry.name.toLowerCase().endsWith('.json')
      && (() => {
        const config = readJson(filePath, entry.name);
        return referencesOllama(config) || referencesAiModelOrInstaller(config);
      })()
    ) {
      throw new Error(`Automatically merged ${entry.name} must not include AI models or optional installers.`);
    }
    if (!entry.name.toLowerCase().endsWith('.json') && /ollama/i.test(readFileSync(filePath, 'utf8'))) {
      throw new Error(`Automatically merged ${entry.name} must not include the optional Ollama installer.`);
    }
  }

  if (referencesOllama(overlay) || referencesAiModelOrInstaller(overlay)) {
    throw new Error('The explicit --offline-pack overlay must not include Ollama installers or AI model weights.');
  }
  if (overlay?.bundle?.windows?.webviewInstallMode?.type !== 'offlineInstaller') {
    throw new Error('The explicit --offline-pack overlay must carry the WebView2 offline prerequisite.');
  }
}

try {
  verifyAiResourceBoundary();
} catch (error) {
  missing.push(error instanceof Error ? error.message : String(error));
}

const msvcLinkerAvailable = process.platform !== 'win32' || (() => {
  const probe = spawnSync('where', ['link.exe'], { encoding: 'utf8', shell: false, env: environment });
  const buildToolsRoot = join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft Visual Studio', '2022', 'BuildTools', 'VC', 'Tools', 'MSVC');
  return (!probe.error && probe.status === 0 && /Microsoft Visual Studio/i.test(probe.stdout)) || existsSync(buildToolsRoot);
})();

if (!msvcLinkerAvailable) missing.push('Visual Studio C++ Build Tools (MSVC linker: link.exe)');

if (missing.length === 0) {
  if (requestedRoot.toLowerCase() !== root.toLowerCase()) {
    console.log(`Desktop junction resolved to ${root}`);
  }
  console.log('Desktop prerequisites and optional-resource boundaries passed.');
  process.exit(0);
}

console.error('Cannot build the Selenyx desktop installer because these local prerequisites are missing:');
for (const item of missing) console.error(`  - ${item}`);
console.error('Install them, open a new terminal, then run `npm run desktop:build` again.');
console.error('Suggested Windows installers: `winget install Rustlang.Rustup` and Visual Studio Build Tools with the Desktop development with C++ workload.');
process.exit(1);
