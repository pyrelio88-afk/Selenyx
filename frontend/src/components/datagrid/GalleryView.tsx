/**
 * 画廊视图 — 卡片网格（Notion Gallery 模式）
 * 大图优先的视觉浏览，适合快速扫文献封面/标题/状态。
 */

import type { Reference } from '@types/reference';
import { StatusChip } from '@components/ui/StatusChip';
import { Icon } from '@components/ui/Icon';

interface GalleryViewProps {
  references: Reference[];
  onSelect: (id: string) => void;
}

const TYPE_GRADIENTS: Record<string, string> = {
  journalArticle: 'linear-gradient(135deg, #6aa84f22, #6aa84f08)',
  conferencePaper: 'linear-gradient(135deg, #c0432b22, #c0432b08)',
  book: 'linear-gradient(135deg, #3d6fa322, #3d6fa308)',
  thesis: 'linear-gradient(135deg, #8e6fb322, #8e6fb308)',
  preprint: 'linear-gradient(135deg, #d4a62a22, #d4a62a08)',
};

export function GalleryView({ references, onSelect }: GalleryViewProps) {
  if (references.length === 0) {
    return (
      <div className="empty-state">
        <Icon name="references" size={48} strokeWidth={1.2} />
        <p>暂无文献</p>
      </div>
    );
  }
  return (
    <div className="gallery-grid" role="list" aria-label="文献画廊">
      {references.map((r) => (
        <button
          key={r.id}
          className="gallery-card"
          onClick={() => onSelect(r.id)}
          role="listitem"
          aria-label={r.title}
        >
          <div
            className="gallery-cover"
            style={{ background: TYPE_GRADIENTS[r.type] ?? 'linear-gradient(135deg, var(--bg-hover), var(--bg-surface))' }}
          >
            <span className="gallery-cover-icon">
              <Icon name="references" size={36} strokeWidth={1.2} />
            </span>
            <span className="gallery-cover-year">{r.year}</span>
          </div>
          <div className="gallery-body">
            <div className="gallery-title">{r.title || '（无标题）'}</div>
            <div className="gallery-authors">
              {r.creators.slice(0, 2).map((c) => c.lastName).join(', ')}
              {r.creators.length > 2 && ' 等'}
            </div>
            <div className="gallery-footer">
              <StatusChip status={r.readStatus} size="xs" />
              <span className="gallery-if">
                {r.impactFactor != null ? `IF ${r.impactFactor.toFixed(1)}` : ''}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
