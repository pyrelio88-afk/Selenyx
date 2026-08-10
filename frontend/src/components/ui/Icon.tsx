/**
 * Selenyx 线性图标系统
 *
 * 设计取向（回应「月亮太难看、避免方块模组 AI 化」）：
 * - 全部手绘 inline SVG path，统一 24×24 viewBox、1.6 描边、currentColor
 * - 线性（stroke）风格，圆角端点，非填充方块——避免 AI 生成常见的几何拼贴感
 * - 每个图标有视觉重量校准，导航族与功能族协调
 * - 零依赖、零字体加载，随主题色变化
 */

import type { ReactNode } from 'react';

export type IconName =
  // 导航
  | 'dashboard' | 'references' | 'pipeline' | 'projects'
  | 'tables' | 'statTools' | 'clinicalData' | 'aiChat' | 'settings' | 'skills'
  | 'notes'
  // 模式切换（手绘日/月，非 emoji）
  | 'sun' | 'moon'
  // 操作
  | 'plus' | 'search' | 'import' | 'download' | 'close' | 'check' | 'chevronRight'
  | 'filter' | 'sort' | 'more'
  | 'menu'
  | 'warning'
  // 流水线阶段
  | 'stageProblem' | 'stageLiterature' | 'stageFulltext' | 'stageScreening'
  | 'stageReading' | 'stageEvidence' | 'stageSynthesis' | 'stageWriting'
  // 状态/类型
  | 'dot' | 'empty' | 'link' | 'tag' | 'calendar'
  // 工具箱专用
  | 'globe' | 'quote' | 'grant' | 'count' | 'shield' | 'target' | 'blueprint' | 'chip' | 'chart'
  // R109 AI 助手动作图标
  | 'copy' | 'pencil' | 'retry' | 'branch' | 'pin' | 'trash' | 'send' | 'stop'
  | 'sparkles' | 'chevronDown' | 'chevronLeft' | 'clock' | 'editIn' | 'list';

const PATHS: Record<IconName, ReactNode> = {
  // 导航 —— 视觉重量统一，区分度高
  dashboard: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  references: (<><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15.5H5.5A1.5 1.5 0 0 1 4 18z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15.5h5.5a1.5 1.5 0 0 0 1.5-1.5z" /><path d="M11 4v15.5" /></>),
  pipeline: (<><path d="M9 9h6" /><path d="M9 15h6" /><rect x="4" y="6" width="5" height="5" rx="1" /><rect x="15" y="6" width="5" height="5" rx="1" /><rect x="4" y="13" width="5" height="5" rx="1" /><rect x="15" y="13" width="5" height="5" rx="1" /></>),
  projects: (<><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l1.5 2h9A1.5 1.5 0 0 1 20.5 9.5v8A1.5 1.5 0 0 1 19 19H4.5A1.5 1.5 0 0 1 3 17.5z" /><path d="M3 10h18" /></>),
  tables: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M9 4v16" /><path d="M15 4v16" /></>),
  statTools: (<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M3 20h18" /></>),
  clinicalData: (<><path d="M12 4v16" /><path d="M4 12h16" /><path d="M7 7c0 2.5 2.2 5 5 5s5-2.5 5-5" /><path d="M12 4a3 3 0 0 0-3 3" /><path d="M12 4a3 3 0 0 1 3 3" /></>),
  aiChat: (<><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><path d="M12 8.5l.9 2 2.1.3-1.5 1.5.4 2.1L12 13.4l-1.9 1 .4-2.1L9 10.8l2.1-.3z" /></>),
  settings: (<><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></>),
  skills: (<><path d="M12 3l8 4v6c0 4-3.2 6.5-8 8-4.8-1.5-8-4-8-8V7z" /><path d="M8.5 12l2.5 2.5L15.5 10" /></>),
  // 笔记区 —— 翻开的本子 + 书写线（手绘意象，非方块）
  notes: (<><path d="M5 3.5A1.5 1.5 0 0 1 6.5 2H18a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6.5A1.5 1.5 0 0 1 5 20.5z" /><path d="M5 5.5h2M5 9h2M5 12.5h2M5 16h2" /><path d="M9.5 8h7M9.5 11.5h7M9.5 15h4" /></>),

  // 模式切换 —— 手绘日轮/月牙，非 emoji
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" /></>),
  moon: (<><path d="M20 13.2A7.8 7.8 0 0 1 10.8 4a7.8 7.8 0 1 0 9.2 9.2z" /><path d="M15 7.5a2 2 0 0 0 1.8 2.8" /></>),

  // 操作
  plus: (<><path d="M12 5v14M5 12h14" /></>),
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>),
  import: (<><path d="M12 4v11" /><path d="M8 11l4 4 4-4" /><path d="M5 19h14" /></>),
  download: (<><path d="M12 4v11" /><path d="M8 11l4 4 4-4" /><path d="M5 19h14" /><path d="M5 16v3h14v-3" /></>),
  close: (<><path d="M6 6l12 12M18 6L6 18" /></>),
  check: (<><path d="M5 12.5l4.5 4.5L19 7" /></>),
  chevronRight: (<><path d="M9 5l7 7-7 7" /></>),
  filter: (<><path d="M4 6h16l-6 7v5l-4 2v-7z" /></>),
  sort: (<><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" /></>),
  more: (<><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>),
  menu: (<><rect x="3" y="4" width="18" height="2.4" rx="1.2" /><rect x="3" y="10.8" width="18" height="2.4" rx="1.2" /><rect x="3" y="17.6" width="12" height="2.4" rx="1.2" /></>),
  warning: (<><path d="M12 4L2.5 20h19L12 4z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" /></>),

  // 流水线阶段 —— 每阶段独立意象，非统一方块
  stageProblem: (<><circle cx="12" cy="12" r="8.5" /><path d="M9.2 9.2a2.8 2.8 0 0 1 5.3 1c0 1.8-2.5 2-2.5 3.5" /><circle cx="12" cy="16.8" r="0.6" fill="currentColor" stroke="none" /></>),
  stageLiterature: (<><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15.5H5.5A1.5 1.5 0 0 1 4 18z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15.5h5.5a1.5 1.5 0 0 0 1.5-1.5z" /><path d="M7 8h2M7 11h2M15 8h2M15 11h2" /></>),
  stageFulltext: (<><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v4h4" /><path d="M8 12h8M8 15h8M8 18h5" /></>),
  stageScreening: (<><path d="M4 5h16l-6 7v6l-4 2v-8z" /><path d="M7.5 8h9" /></>),
  stageReading: (<><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H10a2 2 0 0 1 2 2 2 2 0 0 1 2-2h5.5A1.5 1.5 0 0 1 21 5.5v12A1.5 1.5 0 0 1 19.5 19H14a2 2 0 0 0-2 1 2 2 0 0 0-2-1H4.5A1.5 1.5 0 0 1 3 17.5z" /><path d="M12 7v12" /></>),
  stageEvidence: (<><path d="M12 3l8 4v5c0 4.5-3.2 7.5-8 9-4.8-1.5-8-4.5-8-9V7z" /><path d="M9 12l2 2 4-4" /></>),
  stageSynthesis: (<><path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.4-1.5 1-1.5 2v.4" /><path d="M12 18.5v.5" /><path d="M5.5 6.5l1.2 1.2M18.5 6.5l-1.2 1.2M5.5 17.5l1.2-1.2M18.5 17.5l-1.2-1.2" /></>),
  stageWriting: (<><path d="M4 20l4-1L19 8a2 2 0 0 0-2.8-2.8L5 16z" /><path d="M14 6l4 4" /><path d="M4 20l1-4" /></>),

  // 状态/类型
  dot: (<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />),
  empty: (<><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" /><path d="M8 14s1.2-2 4-2 4 2 4 2" /><path d="M9 9.5h.01M15 9.5h.01" /></>),
  link: (<><path d="M9 15l6-6" /><path d="M10.5 6.5l1-1a3.5 3.5 0 0 1 5 5l-1 1" /><path d="M13.5 17.5l-1 1a3.5 3.5 0 0 1-5-5l1-1" /></>),
  tag: (<><path d="M4 4h7l9 9-7 7-9-9z" /><circle cx="8" cy="8" r="1.4" /></>),
  calendar: (<><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></>),
  // 工具箱专用图标
  globe: (<><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.5 2.5 14 0 17M12 3.5c-2.5 2.5-2.5 14 0 17" /></>),
  quote: (<><path d="M7 7c-1.5 1-2 3-2 5v5h4v-5H7c0-1.5.5-2.5 1.5-3z" /><path d="M15 7c-1.5 1-2 3-2 5v5h4v-5h-2c0-1.5.5-2.5 1.5-3z" /></>),
  grant: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" /></>),
  count: (<><path d="M4 6h16M4 12h16M4 18h10" /><path d="M18 16v4M16 18h4" /></>),
  shield: (<><path d="M12 3l8 3v5c0 4.5-3.2 7.5-8 9-4.8-1.5-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>),
  target: (<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>),
  blueprint: (<><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 9h18M9 9v11M15 9v11M3 14h18" /></>),
  chip: (<><rect x="6" y="6" width="12" height="12" rx="1.5" /><path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3" /></>),

  // R109 AI 助手动作 —— 线性、1.6 描边、currentColor，与既有图标视觉重量一致
  copy: (<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></>),
  pencil: (<><path d="M4 20l4-1L19 8a2 2 0 0 0-2.8-2.8L5 16z" /><path d="M14 6l4 4" /></>),
  retry: (<><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v4h-4" /></>),
  branch: (<><circle cx="6" cy="6" r="2.2" /><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="8" r="2.2" /><path d="M6 8.2v7.6" /><path d="M18 10.2c0 4-4 3.8-6 5.8" /></>),
  pin: (<><path d="M9 3h6l-1 5 3 3v2H7v-2l3-3z" /><path d="M12 13v8" /></>),
  trash: (<><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /><path d="M10 11v6M14 11v6" /></>),
  send: (<><path d="M4 12l16-7-7 16-2.5-6.5z" /><path d="M10.5 14.5L20 5" /></>),
  stop: (<><rect x="6" y="6" width="12" height="12" rx="2.5" /></>),
  sparkles: (<><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" /><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" /></>),
  chevronDown: (<><path d="M5 9l7 7 7-7" /></>),
  chevronLeft: (<><path d="M15 5l-7 7 7 7" /></>),
  clock: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>),
  editIn: (<><path d="M4 20h4L19 9a2 2 0 0 0-2.8-2.8L5 16z" /><path d="M14 6l4 4" /><path d="M4 20l1-4" /></>),
  list: (<><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.3" fill="currentColor" stroke="none" /></>),
  // 图表 —— 三柱递增 + 折线，呼应统计/可视化
  chart: (<><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 20v-6" /><path d="M12 20v-9" /><path d="M16 20v-4" /><path d="M7 14l5-5 3 3 4-6" /></>),
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
  'aria-label'?: string;
}

export function Icon({ name, size = 18, className, strokeWidth, style, 'aria-label': ariaLabel }: IconProps) {
  const sw = strokeWidth ?? 1.6;
  const path = PATHS[name];
  if (!path && import.meta.env.DEV) {
    console.warn(`[Icon] unknown icon name: "${name}" — renders empty`);
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={ariaLabel ? 'img' : 'presentation'}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      style={{ flexShrink: 0, ...style }}
    >
      {path}
    </svg>
  );
}

/** 流水线阶段 key → 图标名映射 */
export const STAGE_ICONS: Record<string, IconName> = {
  problem: 'stageProblem',
  literature: 'stageLiterature',
  fulltext: 'stageFulltext',
  screening: 'stageScreening',
  reading: 'stageReading',
  evidence: 'stageEvidence',
  synthesis: 'stageSynthesis',
  writing: 'stageWriting',
};

/** 导航 key → 图标名映射 */
export const NAV_ICONS: Record<string, IconName> = {
  // v4 主导航
  newTask: 'plus',
  assistant: 'aiChat',
  projects: 'projects',
  library: 'references',
  extensions: 'sparkles',
  automations: 'clock',
  more: 'more',
  // 旧 key（容器 tab / 深链兜底）
  dashboard: 'dashboard',
  references: 'references',
  pipeline: 'pipeline',
  tables: 'tables',
  statTools: 'statTools',
  clinicalData: 'clinicalData',
  aiChat: 'aiChat',
  settings: 'settings',
  skills: 'skills',
  notes: 'notes',
  tools: 'blueprint',
  tasks: 'target',
  experts: 'sparkles',
  connectors: 'globe',
};
