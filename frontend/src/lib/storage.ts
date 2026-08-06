/**
 * D6 localStorage schema versioning（R102）
 *
 * 与 R91.1 的 try-catch 兜底互补：
 * - try-catch（已并入本工具）管"读进来崩不崩"
 * - versioning 管"版本变了怎么迁移"
 * 两层齐了 localStorage 才算有完整的防御链。
 *
 * 纪律：任何 key 的 schema 变更（加字段/改结构）必须 bump SCHEMA_VERSIONS
 * 并补 MIGRATIONS 迁移函数，哪怕只是 `d => d` 占位——占位也要写，保证链路完整可追踪。
 * key 命名去掉版本后缀（旧 -v1 写法废弃），版本号一律走 __v 字段。
 */

/** 各 key 当前 schema 版本（无 __v 的存量数据视为 v1） */
const SCHEMA_VERSIONS: Record<string, number> = {
  'selenyx-pomodoro-events': 2,
  'selenyx-custom-entries': 2,
};

/** 迁移函数链：MIGRATIONS[key][v] = 从 v 迁到 v+1 */
const MIGRATIONS: Record<string, Record<number, (data: any) => any>> = {
  'selenyx-pomodoro-events': {
    // v1→v2：旧格式是裸数组 [{id,name,minutes,kind}]，包成 { items:[...] }
    1: (d) => ({ items: Array.isArray(d) ? d : (d?.items ?? []) }),
  },
  'selenyx-custom-entries': {
    // v1→v2：旧格式是裸数组 [{term,code,...}]，包成 { items:[...] }
    1: (d) => ({ items: Array.isArray(d) ? d : (d?.items ?? []) }),
  },
};

/** 旧 key 名 → 新 key 名映射（兼容历史 -v1 / 不同后缀的 key） */
const LEGACY_KEYS: Record<string, string> = {
  'selenyx-pomodoro-events': 'selenyx-pomodoro-events-v1',
  'selenyx-custom-entries': 'selenyx-custom-entries-v1',
};

/**
 * 读取并自动迁移一个版本化 key。
 * - 找不到新 key 时回退读旧 key 名再迁移，旧数据不孤儿化。
 * - 损坏数据（JSON.parse 失败）回退 defaults 不白屏（R91.1 逻辑并入此处）。
 * - 迁移链断档（缺某步迁移）回退 defaults 并 console.warn。
 * - 浅层补默认：migrate 漏补的字段由 {...defaults, ...migrated} 兜底。
 */
export function versionedLoad<T extends object>(key: string, defaults: T): T {
  try {
    let raw = localStorage.getItem(key);
    // 旧 key 名兼容
    if (raw === null && LEGACY_KEYS[key]) {
      raw = localStorage.getItem(LEGACY_KEYS[key]);
    }
    if (raw === null) return defaults;

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // 旧格式可能是裸数组（v1），无法 JSON 成对象——尝试当数组包一层
      console.warn(`[storage] ${key}: non-JSON legacy data, reset to defaults`);
      return defaults;
    }

    let v = (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.__v) || 1;
    const target = SCHEMA_VERSIONS[key] ?? 1;
    const chain = MIGRATIONS[key] ?? {};
    while (v < target) {
      const step = chain[v];
      if (!step) {
        console.warn(`[storage] ${key}: no migration v${v}→${v + 1}, fallback to defaults`);
        return defaults;
      }
      parsed = step(parsed);
      v++;
    }
    return { ...defaults, ...parsed };
  } catch (e) {
    console.warn(`[storage] ${key} corrupted, reset to defaults`, e);
    return defaults;
  }
}

/** 保存一个版本化 key（附带 __v，quota 超限不崩）。 */
export function versionedSave(key: string, data: object): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ...data, __v: SCHEMA_VERSIONS[key] ?? 1 }));
  } catch (e) {
    console.warn(`[storage] ${key} save failed (quota?)`, e);
  }
}

// === Onboarding flag（独立简单路径：值是字符串标记，非结构化对象） ===
const ONBOARDING_KEY = 'selenyx-onboarding';
const ONBOARDING_LEGACY = 'selenyx-onboarding-done';

/** 读取 onboarding 状态：'true'(完成) | 'skipped'(跳过) | null(未触发) */
export function getOnboardingState(): string | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY);
    if (raw !== null) {
      const p = JSON.parse(raw);
      return p?.flag ?? null;
    }
    // 旧 key 兼容：selenyx-onboarding-done 存的是裸字符串 'true'/'skipped'
    const legacy = localStorage.getItem(ONBOARDING_LEGACY);
    return legacy ?? null;
  } catch {
    return null;
  }
}

/** 写入 onboarding 状态。 */
export function setOnboardingState(flag: string): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ flag, __v: 1 }));
  } catch (e) {
    console.warn(`[storage] onboarding save failed`, e);
  }
}
