import { describe, expect, it, vi } from 'vitest';

import { VoicevoxClient } from '../src/voicevox/client.js';

describe('VoicevoxClient', () => {
  it('version応答をVOICEVOXとして判定する', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify('0.25.2'), { headers: { 'Content-Type': 'application/json' } }),
    );
    const client = new VoicevoxClient(new URL('http://127.0.0.1:50021'), 1_000, fetchMock);

    await expect(client.probe()).resolves.toEqual({ reachable: true, ready: true, version: '0.25.2' });
  });

  it('到達可能だが形式が違う応答を拒否する', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ version: 'other' })));
    const client = new VoicevoxClient(new URL('http://127.0.0.1:50021'), 1_000, fetchMock);

    await expect(client.probe()).resolves.toMatchObject({ reachable: true, ready: false });
  });

  it('audio_queryへ本文とspeakerをクエリで渡す', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ speedScale: 1 }), { headers: { 'Content-Type': 'application/json' } }),
    );
    const client = new VoicevoxClient(new URL('http://127.0.0.1:50021'), 1_000, fetchMock);

    await client.createAudioQuery('完了なのだ', 3);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const requestedUrl = url instanceof Request ? url.url : String(url);
    expect(requestedUrl).toContain('text=%E5%AE%8C%E4%BA%86%E3%81%AA%E3%81%AE%E3%81%A0');
    expect(requestedUrl).toContain('speaker=3');
    expect(init).toMatchObject({ method: 'POST' });
  });
});
