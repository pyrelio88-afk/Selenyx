/**
 * OCR 文字识别服务 — 基于 Tesseract.js（纯前端 WASM，无需后端）
 *
 * 选型结论（R85 深度对比 12+ 开源 OCR 方案）：
 * Selenyx 是纯静态单文件 HTML、无推理后端，VLM 类 OCR（PaddleOCR-VL/OlmOCR/DeepSeek-OCR
 * 等 0.3B–9B）均需 GPU 服务端，不可用。Tesseract.js 是唯一成熟、浏览器原生、轻量且中英文
 * 兼备的方案：核心 WASM ~3.8MB、语言数据按需从 CDN 加载（中文 best 档 ~3MB）、Apache 2.0、
 * v7 较 v6 提速 15–35%。与 pdfjs 文本层互补——文本层为空（扫描版 PDF / 图片）时由 OCR 补位。
 *
 * 资源均从 jsDelivr CDN 运行时加载，不打包进单文件 HTML，构建体积零增长。
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

const TESS_VERSION = '6';
const CDN_BASE = `https://cdn.jsdelivr.net/npm`;
const CORE_CDN = `${CDN_BASE}/tesseract.js-core@5.1.1`;
const LANG_CDN = `${CDN_BASE}/@tesseract.js-data`;
const OCR_LANGS = 'chi_sim+eng';

let tessPromise: Promise<TesseractGlobal> | null = null;
let workerPromise: Promise<TesseractWorker> | null = null;

/** 注入 tesseract.min.js（UMD），返回 window.Tesseract，模块级单例缓存 */
function loadTesseract(): Promise<TesseractGlobal> {
  if (tessPromise) return tessPromise;
  tessPromise = new Promise<TesseractGlobal>((resolve, reject) => {
    if (window.Tesseract) return resolve(window.Tesseract);
    const script = document.createElement('script');
    script.src = `${CDN_BASE}/tesseract.js@${TESS_VERSION}/dist/tesseract.min.js`;
    script.async = true;
    script.onerror = () => {
      tessPromise = null;
      reject(new Error('OCR 引擎加载失败（CDN 不可达）。请检查网络后重试。'));
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
    // 核心 WASM 与语言数据均指向 CDN，避免走默认路径找不到资源
    workerPath: `${CDN_BASE}/tesseract.js@${TESS_VERSION}/dist/worker.min.js`,
    corePath: CORE_CDN,
    langPath: LANG_CDN,
    // 第一次会下载核心+语言数据并缓存到 IndexedDB，后续调用直接命中
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
