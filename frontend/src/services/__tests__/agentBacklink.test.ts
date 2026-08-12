import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentApi } from '@services/agent';

describe('agent chat backlink request', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends only opaque source session identifiers when converting chat to a run', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ runId: 'run-42', status: 'running' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await agentApi.start('整理术后谵妄预防证据', 'project-a', {
      sourceSessionId: 'session-local-42',
      sourceSessionScope: 'project-a',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/agent/runs');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      goal: '整理术后谵妄预防证据',
      projectId: 'project-a',
      sourceSessionId: 'session-local-42',
      sourceSessionScope: 'project-a',
    });
  });
});
