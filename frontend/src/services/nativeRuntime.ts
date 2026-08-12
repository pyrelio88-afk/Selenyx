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

interface TauriEvent {
  emit(event: string, payload?: unknown): Promise<void>;
  listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void>;
}

interface TauriWindow extends Window {
  __TAURI__?: { core?: TauriCore; event?: TauriEvent };
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

/** 切换仙鹤桌宠（桌面端独立透明窗口）；返回切换后的可见状态。 */
export function setPetVisible(visible: boolean): Promise<boolean> {
  return invoke<boolean>('toggle_pet', { visible });
}

/** 终态 run 让桌宠显示短状态气泡；非桌面环境静默无操作。 */
export interface PetRuntimeState {
  pendingCount: number;
  completedToday: number;
  failedToday: number;
  runningToday: number;
  message?: string;
  status?: 'completed' | 'failed';
}

/** Broadcast a state snapshot to the optional native companion window. */
export function emitPetState(state: PetRuntimeState): void {
  const emit = runtimeWindow()?.__TAURI__?.event?.emit;
  if (!emit) return;
  void emit('pet:state', state).catch(() => { /* Browser/mobile builds have no pet event bus. */ });
}

/** A terminal run gets a concise status bubble; there is intentionally no flight animation. */
export function emitPetCelebrate(state: PetRuntimeState): void {
  const emit = runtimeWindow()?.__TAURI__?.event?.emit;
  if (!emit) return;
  void emit('pet:celebrate', state).catch(() => { /* 权限缺失或窗口已关：不值得惊动用户 */ });
}

/**
 * Subscribe once to a native pet action.  The returned cleanup is safe even
 * when a component unmounts before Tauri resolves the asynchronous listener.
 */
export function listenForPetEvent<T>(event: string, handler: (payload: T) => void): () => void {
  const listen = runtimeWindow()?.__TAURI__?.event?.listen;
  if (!listen) return () => {};
  let disposed = false;
  let unlisten: (() => void) | undefined;
  void listen<T>(event, ({ payload }) => handler(payload))
    .then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    })
    .catch(() => { /* An older desktop runtime simply does not expose this feature. */ });
  return () => {
    disposed = true;
    unlisten?.();
  };
}

export function requestPetSummary(state: PetRuntimeState): void {
  const emit = runtimeWindow()?.__TAURI__?.event?.emit;
  if (!emit) return;
  void emit('pet:summary', state).catch(() => {});
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
