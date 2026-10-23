const TRANSIENT_PATTERN = /(^API \d{3}:|Failed to fetch|NetworkError|ECONNREFUSED|ECONNRESET|Load failed|timed out|timeout)/i;

export function rawErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '';
}

export function isTransientServiceError(error: unknown): boolean {
  return TRANSIENT_PATTERN.test(rawErrorText(error));
}

/** HTTP/网络层错误原文不适合直接展示；换成可读提示，原文留给 title 提示。 */
export function serviceErrorMessage(error: unknown, fallback: string): string {
  const raw = rawErrorText(error);
  if (!raw) return fallback;
  return isTransientServiceError(error) ? '本机服务未响应，请确认后端已启动后重试。' : raw;
}
