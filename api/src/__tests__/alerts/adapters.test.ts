import { describe, it, expect, vi, afterEach } from 'vitest';
import { SlackChannel } from '../../alerts/adapters/slack';
import { DiscordChannel } from '../../alerts/adapters/discord';
import { EmailChannel } from '../../alerts/adapters/email';

// === Alert Adapters ===
// 각 어댑터는 AlertChannel 인터페이스를 구현하며, fetch를 통해 각자의 포맷으로
// 웹훅 엔드포인트에 POST 요청을 보낸다.
//
// 검증 범위 (어댑터 공통):
// - 생성자에 전달된 webhookUrl로 POST 요청하는가.
// - Content-Type: application/json 헤더가 포함되는가.
// - 메서드가 POST인가.
//
// 검증 범위 (어댑터 개별):
// - SlackChannel: body에 title과 body 텍스트가 포함되는가.
// - DiscordChannel: critical → color 16711680, warning → color 16776960인가.
// - EmailChannel: subject에 severity가 대문자로 포함되는가.

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

describe('EmailChannel', () => {
  // Q. subject에 severity가 대문자로 포함되는가?
  it('includes uppercased severity in the subject', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await new EmailChannel('https://email.example.com/webhook').send('critical', 'Disk Full', 'details');

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.subject).toContain('CRITICAL');
    expect(payload.subject).toContain('Disk Full');
  });

  // Q. warning severity도 대문자로 변환되는가?
  it('uppercases warning severity in the subject', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await new EmailChannel('https://email.example.com/webhook').send('warning', 'T', 'B');

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.subject).toContain('WARNING');
  });

  // Q. body에 title과 body 텍스트가 포함되는가?
  it('includes title and body in the email body field', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await new EmailChannel('https://email.example.com/webhook').send('warning', 'My Title', 'My Body');

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.body).toContain('My Title');
    expect(payload.body).toContain('My Body');
  });
});
