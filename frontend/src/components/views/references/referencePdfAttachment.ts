import type { Reference } from '@apptypes/reference';

function isPdfAttachment(attachment: Reference['attachments'][number]): boolean {
  return attachment.mimeType.toLowerCase() === 'application/pdf'
    || attachment.filename.toLowerCase().endsWith('.pdf')
    || attachment.path.toLowerCase().endsWith('.pdf');
}

/** Returns the actual stored PDF attachment path when a reference has one. */
export function findPdfAttachmentPath(reference: Reference | undefined): string | null {
  const path = reference?.attachments.find(isPdfAttachment)?.path.trim();
  return path || null;
}

/** Converts a Windows path only when it is an explicit local attachment path. */
export function toPdfSource(path: string): string {
  if (/^[A-Za-z]:[\\/]/.test(path)) return `file:///${path.replace(/\\/g, '/')}`;
  return path;
}
