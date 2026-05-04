import { describe, it, expect, vi, afterEach } from 'vitest';
import { EmailChannel } from '../../../alerts/channels/email';

afterEach(() => {
  vi.unstubAllGlobals();
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
