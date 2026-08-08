import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Reference } from '@apptypes/reference';
import { refApi } from '../api';
import {
  bootstrapReferenceRepository,
  normalizeBackendReference,
  reconcileReferences,
  removeMirroredReference,
} from '../referenceRepository';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function reference(id: string, updatedAt: string, title: string): Reference {
  return normalizeBackendReference({ id, updatedAt, title });
}

describe('referenceRepository', () => {
  it('normalizes legacy backend rows into a render-safe Reference', () => {
    const normalized = normalizeBackendReference({
      id: 'legacy-1',
      title: 'Legacy SQLite row',
      cite_key: 'Legacy2024',
      updated_at: '2024-01-01T00:00:00Z',
    });

    expect(normalized).toMatchObject({
      id: 'legacy-1',
      citeKey: 'Legacy2024',
      title: 'Legacy SQLite row',
      updatedAt: '2024-01-01T00:00:00Z',
    });
    expect(normalized.creators).toEqual([]);
    expect(normalized.annotations).toEqual([]);
    expect(normalized.attachments).toEqual([]);
    expect(normalized.doi).toBe('');
  });

  it('reconciles by stable id and latest update, preferring SQLite on ties', () => {
    const result = reconcileReferences(
      [
        reference('local-newer', '2026-08-07T03:00:00Z', 'local wins'),
        reference('remote-newer', '2026-08-07T01:00:00Z', 'stale cache'),
        reference('tie', '2026-08-07T02:00:00Z', 'cache tie'),
      ],
      [
        reference('local-newer', '2026-08-07T02:00:00Z', 'stale sqlite'),
        reference('remote-newer', '2026-08-07T04:00:00Z', 'sqlite wins'),
        reference('tie', '2026-08-07T02:00:00Z', 'sqlite tie'),
        reference('sqlite-only', '2026-08-07T00:00:00Z', 'durable only'),
      ],
    );

    expect(result).toHaveLength(4);
    expect(result.find((item) => item.id === 'local-newer')?.title).toBe('local wins');
    expect(result.find((item) => item.id === 'remote-newer')?.title).toBe('sqlite wins');
    expect(result.find((item) => item.id === 'tie')?.title).toBe('sqlite tie');
    expect(result.find((item) => item.id === 'sqlite-only')?.title).toBe('durable only');
  });

  it('keeps an offline deletion tombstone so startup does not resurrect the SQLite row', async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.spyOn(refApi, 'delete')
      .mockRejectedValueOnce(new Error('sidecar offline'))
      .mockResolvedValueOnce(undefined);
    vi.spyOn(refApi, 'snapshot').mockResolvedValue({
      references: [reference('deleted-offline', '2026-08-07T01:00:00Z', 'must stay deleted')],
      count: 1,
      payloadVersion: 1,
    });
    const upsert = vi.spyOn(refApi, 'bulkUpsert').mockResolvedValue({
      stored: 0, created: 0, updated: 0, indexedChunks: 0,
    });

    await removeMirroredReference('deleted-offline');
    const restored = await bootstrapReferenceRepository([]);

    expect(restored.status).toBe('synced');
    expect(restored.references).toEqual([]);
    expect(refApi.delete).toHaveBeenCalledTimes(2);
    expect(upsert).not.toHaveBeenCalled();
  });
});
