/**
 * anydoc 文档转 Markdown 服务
 *
 * 基于 @firecrawl/anydoc-wasm（Firecrawl 官方出品，MIT），在浏览器本地完成转换，
 * 文件不出机器。支持 Word/PowerPoint/Excel/OpenDocument/RTF/EPUB/CSV/纯文本 PDF。
 *
 * 限制：anydoc 对扫描版（图片型）PDF 无 OCR 能力——仅能提取含文本层的 PDF；
 * 图片型 PDF 会抛出 code='unsupported'。UI 层需对此说明。
 *
 * WASM 加载策略：wasm 二进制放 public/ 目录（不参与 singlefile 内联），
 * 运行时 fetch 按需加载——首次使用「文档转MD」时才下载 6.2MB wasm，
 * 避免首屏 bundle 膨胀（gzip 从 6.27MB 回落至 ~1.3MB）。
 *
 * 转换是同步阻塞调用（wasm 单线程），大文件会短暂卡 UI，故在调用前让出主线程一帧
 * 以确保 loading 状态渲染出来。
 */

import {
  initSync,
  toMarkdownBytes,
  formatFromBytes,
  type Format,
} from '@firecrawl/anydoc-wasm';

export type AnydocErrorCode =
  | 'unsupported' | 'malformed' | 'encrypted' | 'resourceLimit' | 'missingPart';

export interface AnydocResult {
  ok: boolean;
  markdown?: string;
  format?: Format;
  /** 失败时的错误码（anydoc 抛出的 Error.code） */
  errorCode?: AnydocErrorCode;
  /** 失败时的错误消息 */
  errorMessage?: string;
  /** 转换耗时（毫秒） */
  elapsedMs?: number;
}

/** 支持的文件扩展名（用于 UI 提示与接受过滤） */
export const ANYDOC_ACCEPT =
  '.pdf,.doc,.docx,.odt,.rtf,.epub,.ppt,.pptx,.odp,.xlsx,.ods,.csv';

/** 扩展名 → anydoc Format 映射（用于无签名格式如 csv 的显式指定） */
const EXT_TO_FORMAT: Record<string, Format> = {
  doc: 'doc', docx: 'docx', odt: 'odt', rtf: 'rtf', epub: 'epub',
  pdf: 'pdf', ppt: 'ppt', pptx: 'pptx', odp: 'odp',
  xlsx: 'xlsx', ods: 'ods', csv: 'csv',
};

let wasmReady = false;
let initPromise: Promise<void> | null = null;

/** 运行时 fetch wasm 二进制（public/ 目录，不参与 singlefile 内联） */
async function loadWasmBytes(): Promise<ArrayBuffer> {
  const res = await fetch('anydoc.wasm');
  if (!res.ok) throw new Error(`anydoc.wasm 加载失败: HTTP ${res.status}`);
  return res.arrayBuffer();
}

/** 惰性初始化 wasm（仅首次调用时 fetch 并实例化，约 6.2MB） */
export function ensureAnydocReady(): Promise<void> {
  if (wasmReady) return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      const buf = await loadWasmBytes();
      // initSync 具名导入；对象形式 { module: BufferSource }（与官方 Node 测试一致）
      initSync({ module: buf });
      wasmReady = true;
    })().catch((err) => {
      initPromise = null; // 失败则允许重试
      throw err;
    });
  }
  return initPromise;
}

/** 从文件名取扩展名（小写、去点） */
function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** 让出主线程一帧，确保后续同步阻塞前 loading UI 已渲染 */
function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/**
 * 将文件转为 Markdown。
 * @param file 浏览器 File 对象
 * @returns 转换结果（成功带 markdown，失败带 errorCode）
 */
export async function convertToMarkdown(file: File): Promise<AnydocResult> {
  const t0 = performance.now();
  try {
    await ensureAnydocReady();
    await nextFrame();
    const u8 = new Uint8Array(await file.arrayBuffer());

    // 先按内容嗅探格式；嗅探不到（如 csv 等无签名格式）再用扩展名兜底
    let format = formatFromBytes(u8) ?? undefined;
    if (!format) {
      const ext = extOf(file.name);
      format = EXT_TO_FORMAT[ext];
    }

    const markdown = toMarkdownBytes(u8, format ?? null);
    return {
      ok: true,
      markdown,
      format: format,
      elapsedMs: Math.round(performance.now() - t0),
    };
  } catch (err) {
    const e = err as Error & { code?: AnydocErrorCode };
    return {
      ok: false,
      errorCode: e?.code,
      errorMessage: e?.message || String(err),
      elapsedMs: Math.round(performance.now() - t0),
    };
  }
}

/** 是否为 anydoc 支持的扩展名 */
export function isAnydocSupported(name: string): boolean {
  return extOf(name) in EXT_TO_FORMAT;
}

/** 错误码 → 中文说明（供 UI 展示） */
export function describeAnydocError(code?: AnydocErrorCode, message?: string): string {
  switch (code) {
    case 'unsupported':
      return '不支持的格式，或为图片型（扫描版）PDF——anydoc 无 OCR 能力，仅能提取含文本层的 PDF。';
    case 'malformed':
      return '文件结构损坏，无法提取有效内容。';
    case 'encrypted':
      return '文件已加密或受密码保护，请先解除保护。';
    case 'resourceLimit':
      return '超出安全限制（解压体积/嵌套深度/节点数过大）。';
    case 'missingPart':
      return '缺少必要组成部分，无法产出内容。';
    default:
      return message || '转换失败，原因未知。';
  }
}
