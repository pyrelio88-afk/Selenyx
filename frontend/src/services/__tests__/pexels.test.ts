import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCuratedPhotos, searchPhotos } from '../pexels';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('client editorial image safety', () => {
  it('does not send a bundled Pexels authorization header', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchPhotos('nursing research', 3)).resolves.toMatchObject({ photos: [], per_page: 3 });
    await expect(getCuratedPhotos(2, 4)).resolves.toMatchObject({ photos: [], per_page: 2, page: 4 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
