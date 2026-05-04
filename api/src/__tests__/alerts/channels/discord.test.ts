import { describe, it, expect, vi, afterEach } from 'vitest';
import { DiscordChannel } from '../../../alerts/channels/discord';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DiscordChannel', () => {
  // Q. critical severity일 때 embed color가 빨간색(16711680)인가?
  it('uses red color (16711680) for critical severity', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await new DiscordChannel('https://discord.com/api/webhooks/test').send('critical', 'T', 'B');

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.embeds[0].color).toBe(16711680);
  });

  // Q. warning severity일 때 embed color가 노란색(16776960)인가?
  it('uses yellow color (16776960) for warning severity', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await new DiscordChannel('https://discord.com/api/webhooks/test').send('warning', 'T', 'B');

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.embeds[0].color).toBe(16776960);
  });

  // Q. embed에 title과 description이 포함되는가?
  it('includes title and description in the embed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await new DiscordChannel('https://discord.com/api/webhooks/test').send('warning', 'Alert Title', 'Alert Body');

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.embeds[0].title).toBe('Alert Title');
    expect(payload.embeds[0].description).toBe('Alert Body');
  });
});
