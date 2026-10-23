/**
 * 工作区检索：把文献、笔记与项目收敛成同一份本地索引。
 * 纯函数、不触网；标题命中优先于元数据与正文，空查询回最近更新。
 */

import { PIPELINE_STAGES } from '@apptypes/project';
import type { Note, Reference, ResearchProject } from '@apptypes/index';

export type KnowledgeKind = 'reference' | 'note' | 'project';

export interface KnowledgeEntry {
  id: string;
  kind: KnowledgeKind;
  title: string;
  subtitle: string;
  body: string;
  updatedAt: string;
}

export interface KnowledgeHit {
  entry: KnowledgeEntry;
  score: number;
  snippet: string;
}

export const KNOWLEDGE_KIND_LABEL: Record<KnowledgeKind, string> = {
  reference: '文献',
  note: '文档·笔记',
  project: '项目',
};

const PROJECT_STATUS_LABEL: Record<ResearchProject['status'], string> = {
  planning: '筹备中',
  active: '进行中',
  paused: '已暂停',
  completed: '已完成',
  archived: '已归档',
};

const STAGE_LABEL = new Map(PIPELINE_STAGES.map((stage) => [stage.key, stage.label]));
const MARKDOWN_MARKERS = /[#*`>_[\]]/g;

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function normalized(text: string): string {
  return clean(text).toLocaleLowerCase();
}

function authorLine(reference: Reference): string {
  const names = reference.creators
    .map((creator) => clean([creator.lastName, creator.firstName].filter(Boolean).join(' ')))
    .filter(Boolean);
  if (names.length <= 2) return names.join('、');
  return `${names.slice(0, 2).join('、')} 等`;
}

function referenceSubtitle(reference: Reference): string {
  return [authorLine(reference), clean(reference.year), clean(reference.publication)]
    .filter(Boolean)
    .join(' · ');
}

function noteSubtitle(note: Note): string {
  const tags = note.tags.slice(0, 2).map((tag) => `#${clean(tag)}`).filter((tag) => tag !== '#');
  return [clean(note.category), ...tags].filter(Boolean).join(' · ');
}

function projectSubtitle(project: ResearchProject): string {
  const stage = STAGE_LABEL.get(project.currentStage) ?? '';
  return [PROJECT_STATUS_LABEL[project.status], stage].filter(Boolean).join(' · ');
}

function projectBody(project: ResearchProject): string {
  const pico = project.pico
    ? [project.pico.population, project.pico.intervention, project.pico.comparison, project.pico.outcome]
    : [];
  const sbar = project.sbar
    ? [project.sbar.situation, project.sbar.background, project.sbar.assessment, project.sbar.recommendation]
    : [];
  return clean([
    project.description,
    project.tags.join(' '),
    STAGE_LABEL.get(project.currentStage) ?? '',
    PROJECT_STATUS_LABEL[project.status],
    ...pico,
    ...sbar,
  ].join(' '));
}

export function buildKnowledgeEntries(input: {
  references: Reference[];
  notes: Note[];
  projects: ResearchProject[];
}): KnowledgeEntry[] {
  const references = input.references.map((reference) => ({
    id: reference.id,
    kind: 'reference' as const,
    title: clean(reference.title) || '未命名文献',
    subtitle: referenceSubtitle(reference),
    body: clean([
      reference.abstract,
      reference.shortTitle,
      reference.notes,
      reference.doi,
      reference.pmid,
      reference.arxivId,
      reference.tags.join(' '),
      reference.creators.map((creator) => `${creator.lastName} ${creator.firstName}`).join(' '),
    ].join(' ')),
    updatedAt: reference.updatedAt,
  }));

  const notes = input.notes.map((note) => ({
    id: note.id,
    kind: 'note' as const,
    title: clean(note.title) || '无标题笔记',
    subtitle: noteSubtitle(note),
    body: clean([note.body, note.tags.join(' '), note.category, note.mood].join(' ')),
    updatedAt: note.updatedAt,
  }));

  const projects = input.projects.map((project) => ({
    id: project.id,
    kind: 'project' as const,
    title: clean(project.name) || '未命名项目',
    subtitle: projectSubtitle(project),
    body: projectBody(project),
    updatedAt: project.updatedAt,
  }));

  return [...references, ...notes, ...projects];
}

export function knowledgeSnippet(text: string, query = '', max = 96): string {
  const source = clean(text.replace(MARKDOWN_MARKERS, ' '));
  if (!source) return '';
  const tokens = normalized(query).split(' ').filter(Boolean);
  const searchable = source.toLocaleLowerCase();
  const token = tokens.find((item) => searchable.includes(item));
  const index = token ? searchable.indexOf(token) : 0;
  const start = Math.max(0, index - 24);
  const end = Math.min(source.length, start + max);
  return `${start > 0 ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`;
}

export function searchKnowledge(entries: KnowledgeEntry[], query: string, limit = 12): KnowledgeHit[] {
  const search = normalized(query);
  if (!search) {
    return [...entries]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, Math.min(limit, 8))
      .map((entry) => ({
        entry,
        score: 0,
        snippet: knowledgeSnippet(entry.subtitle || entry.body),
      }));
  }

  const tokens = search.split(' ').filter(Boolean);
  return entries
    .flatMap((entry) => {
      const title = normalized(entry.title);
      const subtitle = normalized(entry.subtitle);
      const body = normalized(entry.body);
      const haystack = `${title} ${subtitle} ${body}`;
      if (!tokens.every((token) => haystack.includes(token))) return [];

      let score = 0;
      for (const token of tokens) {
        if (title === token) score += 120;
        else if (title.startsWith(token)) score += 80;
        else if (title.includes(token)) score += 50;
        else if (subtitle.includes(token)) score += 24;
        else score += 8;
      }
      return [{
        entry,
        score,
        snippet: knowledgeSnippet(entry.body || entry.subtitle, search),
      }];
    })
    .sort((left, right) => right.score - left.score || right.entry.updatedAt.localeCompare(left.entry.updatedAt))
    .slice(0, Math.max(1, limit));
}

export function formatKnowledgeTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (date.toDateString() === now.toDateString()) {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
