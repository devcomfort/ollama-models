import { describe, it, expect, vi, afterEach } from 'vitest';
import { SlackChannel } from '../../../alerts/channels/slack';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SlackChannel', () => {
  // Q. 올바른 webhookUrl로 POST 요청하는가?
  it('POSTs to the webhook URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const ch = new SlackChannel('https://hooks.slack.com/test');
    await ch.send('warning', 'title', 'body text');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('https://hooks.slack.com/test');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  // Q. Content-Type: application/json 헤더가 포함되는가?
  it('sends Content-Type: application/json', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await new SlackChannel('https://hooks.slack.com/test').send('warning', 'T', 'B');

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  // Q. body에 title과 body 텍스트가 포함되는가?
  it('includes title and body text in the payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await new SlackChannel('https://hooks.slack.com/test').send('critical', 'My Title', 'My Body');

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.text).toContain('My Title');
    expect(payload.text).toContain('My Body');
  });
});
