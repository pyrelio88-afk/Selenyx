import type { Reference } from '@apptypes/reference';

export interface LocalFileItem {
  referenceId: string;
  title: string;
  filename: string;
  path: string;
  kind: 'pdf' | 'image' | 'other';
}

function kindOf(attachment: Reference['attachments'][number]): LocalFileItem['kind'] {
  const mime = (attachment.mimeType || '').toLowerCase();
  const name = `${attachment.filename || ''} ${attachment.path || ''}`.toLowerCase();
  if (mime === 'application/pdf' || name.indexOf('.pdf') >= 0) return 'pdf';
  if (mime.indexOf('image/') === 0 || /\.(png|jpe?g|webp|gif|bmp)$/.test(name)) return 'image';
  return 'other';
}

export function listLocalFiles(references: Reference[]): LocalFileItem[] {
  const items: LocalFileItem[] = [];
  references.forEach((reference) => {
    (reference.attachments || []).forEach((attachment) => {
      const path = (attachment.path || '').trim();
      if (!path) return;
      items.push({
        referenceId: reference.id,
        title: reference.title || '未命名文献',
        filename: attachment.filename || path.split(/[\\/]/).pop() || path,
        path,
        kind: kindOf(attachment),
      });
    });
  });
  return items;
}
