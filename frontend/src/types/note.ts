/**
 * Selenyx 笔记模型（R109 新增）
 *
 * 定位：科研工作流中的「随手记」——心得、灵感、心情、方法笔记，
 * 可关联文献条目与流水线阶段，数据走 Zustand persist（与现有架构一致）。
 * 设计参考：Obsidian 的 Markdown 本地优先 + Logseq 的标签/反链 + Joplin 的可移植纯文本，
 * 但不引入外部依赖，保持单文件 HTML 可部署。
 */

import type { PipelineStageKey } from './reference';

/** 笔记分类预设（用户也可自由输入自定义分类） */
export const NOTE_CATEGORIES = ['心得', '灵感', '心情', '方法笔记', '文献批注', '待办想法'] as const;

/** 心情标记（语义词而非 emoji，与设计系统一致） */
export const NOTE_MOODS = ['平静', '兴奋', '困惑', '受挫', '感激', '焦虑'] as const;

export interface Note {
  id: string;
  title: string;
  /** 正文，Markdown 纯文本 */
  body: string;
  /** 分类，自由文本（提供预设但可自定义） */
  category: string;
  /** 标签数组 */
  tags: string[];
  /** 关联文献 id 列表（反链到文献库） */
  linkedReferenceIds: string[];
  /** 关联流水线阶段（如精读段随手记） */
  linkedStage: PipelineStageKey | null;
  /** 心情标记，可选 */
  mood: string;
  /** 置顶 */
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export function createEmptyNote(partial: Partial<Note> = {}): Note {
  const now = new Date().toISOString();
  return {
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    body: '',
    category: '心得',
    tags: [],
    linkedReferenceIds: [],
    linkedStage: null,
    mood: '',
    pinned: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}
