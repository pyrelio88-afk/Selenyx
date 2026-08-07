/**
 * Narrow bridge for features that must stay on the user's device.
 *
 * This module deliberately exposes write-only configuration commands: webview
 * code can ask the native host to persist a secret, but can never read it
 * back. Browser development and mobile builds gracefully fall back instead of
 * pretending that a desktop sidecar exists.
 */

interface TauriCore {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

interface TauriWindow extends Window {
  __TAURI__?: { core?: TauriCore };
}

function runtimeWindow(): TauriWindow | null {
  return typeof window === 'undefined' ? null : window as TauriWindow;
}

export function isTauriRuntime(): boolean {
  const current = runtimeWindow();
  return Boolean(current && '__TAURI_INTERNALS__' in current);
}

export function isMobileTauri(): boolean {
  if (!isTauriRuntime() || typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isDesktopTauri(): boolean {
  return isTauriRuntime() && !isMobileTauri();
}

function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const invokeCommand = runtimeWindow()?.__TAURI__?.core?.invoke;
  if (!invokeCommand) {
    return Promise.reject(new Error('This action requires the installed Selenyx desktop app.'));
  }
  return invokeCommand<T>(command, args);
}

export interface LocalLLMConfigInput {
  /** Undefined preserves an existing private key; an empty string clears it. */
  apiKey?: string;
  baseUrl: string;
  model: string;
}

/** Writes the key to the native application's private local configuration. */
export function saveLocalLLMConfig(config: LocalLLMConfigInput): Promise<void> {
  return invoke<void>('save_llm_config', { config });
}

export function exportNativeState(json: string): Promise<string> {
  return invoke<string>('export_state', { json });
}

export function importNativeState(): Promise<string | null> {
  return invoke<string | null>('import_state');
}

/** Deletes only the explicit native JSON recovery snapshot. */
export function deleteNativeStateBackup(): Promise<void> {
  return invoke<void>('delete_state_backup');
}
