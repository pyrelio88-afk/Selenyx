/**
 * OCR 文字识别服务 — 基于 Tesseract.js（纯前端 WASM，无需后端）
 *
 * 选型结论（R85 深度对比 12+ 开源 OCR 方案）：
 * Selenyx 是纯静态单文件 HTML、无推理后端，VLM 类 OCR（PaddleOCR-VL/OlmOCR/DeepSeek-OCR
 * 等 0.3B–9B）均需 GPU 服务端，不可用。Tesseract.js 是唯一成熟、浏览器原生、轻量且中英文
 * 兼备的方案：核心 WASM 与中英文轻量模型随应用携带、Apache 2.0、
 * v7 较 v6 提速 15–35%。与 pdfjs 文本层互补——文本层为空（扫描版 PDF / 图片）时由 OCR 补位。
 *
 * OCR 资源位于 public/ocr，构建时作为本地应用资源复制；运行时不请求 CDN。
 * 中文护理文献默认 chi_sim+eng 双语识别。
 */

/** Tesseract.js 运行时类型（UMD 全局，按需断言） */
interface TesseractWorker {
  recognize: (image: unknown, options?: Record<string, unknown>, output?: Record<string, unknown>) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<void>;
}
interface TesseractGlobal {
  createWorker: (langs: string, oem?: number, options?: Record<string, unknown>) => Promise<TesseractWorker>;
  recognize: (image: unknown) => Promise<{ data: { text: string; confidence: number } }>;
}

declare global {
  interface Window { Tesseract?: TesseractGlobal }
}

/** Pinned files shipped in `public/ocr`; no runtime CDN dependency. */
export const OCR_ASSET_MANIFEST = Object.freeze({
  runtime: 'tesseract.js@6.0.1',
  core: 'tesseract.js-core@5.1.1',
  languages: 'chi_sim+eng (4.0.0_best_int)',
  root: 'ocr/',
  worker: 'ocr/worker.min.js',
  coreDirectory: 'ocr/core/',
  languageDirectory: 'ocr/lang/',
});

function localOcrAsset(path: string): string {
  return new URL(`${OCR_ASSET_MANIFEST.root}${path}`, document.baseURI).toString();
}

const OCR_LANGS = 'chi_sim+eng';

let tessPromise: Promise<TesseractGlobal> | null = null;
let workerPromise: Promise<TesseractWorker> | null = null;

/** 注入 tesseract.min.js（UMD），返回 window.Tesseract，模块级单例缓存 */
function loadTesseract(): Promise<TesseractGlobal> {
  if (tessPromise) return tessPromise;
  tessPromise = new Promise<TesseractGlobal>((resolve, reject) => {
    if (window.Tesseract) return resolve(window.Tesseract);
    const script = document.createElement('script');
    script.src = localOcrAsset('tesseract.min.js');
    script.async = true;
    script.onerror = () => {
      tessPromise = null;
      reject(new Error('OCR 本地运行资源不可用。请重新安装完整的 Selenyx 应用后重试。'));
    };
    script.onload = () => {
      if (window.Tesseract) resolve(window.Tesseract);
      else { tessPromise = null; reject(new Error('OCR 引擎初始化异常')); }
    };
    document.head.appendChild(script);
  });
  return tessPromise;
}

/** 获取（复用）OCR worker，双语 chi_sim+eng */
async function getWorker(): Promise<TesseractWorker> {
  if (workerPromise) return workerPromise;
  const Tesseract = await loadTesseract();
  workerPromise = Tesseract.createWorker(OCR_LANGS, 1, {
    // 运行时、WASM 核心和中英模型都随应用携带，不依赖联网下载。
    workerPath: localOcrAsset('worker.min.js'),
    corePath: localOcrAsset('core/'),
    langPath: localOcrAsset('lang/'),
    // IndexedDB 仅作本地缓存，不包含任何远程回退路径。
    logger: () => { /* 进度由 recognize 的 status 回调承接，这里静默 */ },
  });
  return workerPromise;
}

export interface OcrResult {
  text: string;
  confidence: number;
}

/**
 * 对图片/Canvas 运行 OCR 识别。
 * @param image HTMLCanvasElement | HTMLImageElement | Blob | dataURL 字符串
 */
export async function runOcr(image: unknown): Promise<OcrResult> {
  const worker = await getWorker();
  const { data } = await worker.recognize(image, {}, {
    // v6+ recognize 第三参控制输出；只要纯文本
    text: true,
  });
  return {
    text: (data.text || '').trim(),
    confidence: Math.round(data.confidence ?? 0),
  };
}

/**
 * 探测 PDF 是否为扫描版（无文本层）。
 * 抽样前若干页，若平均每页可提取字符数低于阈值即判定为扫描版——此时 OCR 才有价值。
 */
export async function detectScannedPdf(
  doc: { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }> },
  samplePages = 3,
  threshold = 20,
): Promise<boolean> {
  try {
    const n = Math.min(doc.numPages, samplePages);
    let totalChars = 0;
    for (let p = 1; p <= n; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      for (const item of tc.items) totalChars += (typeof item === 'object' && item !== null && 'str' in item ? String((item as { str?: string }).str ?? '') : '').length;
    }
    return totalChars / n < threshold;
  } catch {
    return false;
  }
}

/** 释放 worker（卸载组件 / 切换文档时调用，回收内存） */
export async function terminateOcr(): Promise<void> {
  if (workerPromise) {
    try {
      const w = await workerPromise;
      await w.terminate();
    } catch { /* 终止失败忽略 */ }
    workerPromise = null;
  }
}

/** 当前 OCR 语言（展示用） */
export const OCR_LANG_LABEL = '中英文（chi_sim + eng）';
