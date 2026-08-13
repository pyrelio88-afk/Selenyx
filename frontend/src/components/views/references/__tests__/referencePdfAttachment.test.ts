import { describe, expect, it } from 'vitest';
import type { Reference } from '@apptypes/reference';
import { findPdfAttachmentPath, toPdfSource } from '../referencePdfAttachment';

function reference(attachments: Reference['attachments']): Reference {
  return { id: 'ref-1', attachments } as Reference;
}

describe('reference PDF attachment handoff', () => {
  it('prefers a real stored PDF attachment before asking the user to select one', () => {
    expect(findPdfAttachmentPath(reference([
      { id: 'notes', filename: 'notes.txt', mimeType: 'text/plain', path: 'C:/notes.txt', size: 1 },
      { id: 'pdf', filename: 'paper.pdf', mimeType: 'application/pdf', path: 'C:/papers/paper.pdf', size: 2 },
    ]))).toBe('C:/papers/paper.pdf');
  });

  it('keeps URL sources and makes a Windows file path explicit', () => {
    expect(toPdfSource('https://example.test/paper.pdf')).toBe('https://example.test/paper.pdf');
    expect(toPdfSource('C:\\papers\\paper.pdf')).toBe('file:///C:/papers/paper.pdf');
  });
});
