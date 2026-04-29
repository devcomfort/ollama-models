import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlertService, createAlertService } from '../../alerts/service';
import type { AlertChannel } from '../../alerts/types';

// === AlertService ===
// AlertService는 등록된 채널에 Promise.allSettled로 병렬 발송하는 파사드다.
//
// 검증 범위:
// - 모든 채널에 올바른 인수가 전달되는가.
// - 한 채널이 실패해도 나머지 채널은 발송되는가.
// - 채널 실패는 호출자에게 예외를 전파하지 않는가 (fire-and-forget).
// - 채널이 없으면 send()가 아무 예외 없이 완료되는가.

describe('AlertService', () => {
  let channelA: { send: ReturnType<typeof vi.fn> };
  let channelB: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    channelA = { send: vi.fn().mockResolvedValue(undefined) };
    channelB = { send: vi.fn().mockResolvedValue(undefined) };
  });

  // Q. 등록된 모든 채널에 severity/title/body가 그대로 전달되는가?
  it('calls every channel with the correct arguments', async () => {
    const service = new AlertService([channelA as AlertChannel, channelB as AlertChannel]);

    await service.send('critical', 'Health check failed', 'search scraper down');

    expect(channelA.send).toHaveBeenCalledOnce();
    expect(channelA.send).toHaveBeenCalledWith('critical', 'Health check failed', 'search scraper down');
    expect(channelB.send).toHaveBeenCalledOnce();
    expect(channelB.send).toHaveBeenCalledWith('critical', 'Health check failed', 'search scraper down');
  });

  // Q. 한 채널이 reject해도 나머지 채널은 여전히 호출되는가?
  it('delivers to remaining channels when one channel rejects', async () => {
    channelA.send.mockRejectedValue(new Error('webhook unreachable'));

    const service = new AlertService([channelA as AlertChannel, channelB as AlertChannel]);
    // 예외가 전파되지 않아야 한다
    await expect(service.send('warning', 'title', 'body')).resolves.toBeUndefined();

    expect(channelB.send).toHaveBeenCalledOnce();
  });

  // Q. 채널 실패가 호출자에게 예외를 전파하지 않는가?
  it('does not throw when all channels reject', async () => {
    channelA.send.mockRejectedValue(new Error('A failed'));
    channelB.send.mockRejectedValue(new Error('B failed'));

    const service = new AlertService([channelA as AlertChannel, channelB as AlertChannel]);
    await expect(service.send('warning', 'title', 'body')).resolves.toBeUndefined();
  });

  // Q. 채널이 없을 때 send()가 정상 완료되는가?
  it('completes without error when there are no channels', async () => {
    const service = new AlertService([]);
    await expect(service.send('warning', 'title', 'body')).resolves.toBeUndefined();
  });
});

// === createAlertService ===
// createAlertService는 환경 변수에서 웹훅 URL을 읽어 AlertService를 생성한다.
//
// 검증 범위:
// - 설정된 웹훅 URL마다 대응하는 채널이 등록되는가.
// - 웹훅 URL이 하나도 없으면 채널 없이 생성되는가 (no-op).
// - 일부 웹훅만 있을 때 해당 채널만 등록되는가.

describe('createAlertService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Q. 세 웹훅 URL이 모두 있을 때 세 채널 모두에 발송되는가?
  it('registers all three channels when all webhook URLs are present', async () => {
    const service = createAlertService({
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com/test',
      DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/test',
      EMAIL_WEBHOOK_URL: 'https://email.example.com/webhook',
    });

    await service.send('warning', 'title', 'body');

    // fetch가 세 채널에 대해 각각 호출되어야 한다
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });

  // Q. 웹훅 URL이 하나도 없으면 채널 없이 no-op으로 동작하는가?
  it('creates a no-op service when no webhook URLs are configured', async () => {
    const service = createAlertService({});

    await service.send('critical', 'title', 'body');

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  // Q. Slack 웹훅만 있을 때 Slack 채널 하나만 발송하는가?
  it('registers only the Slack channel when only SLACK_WEBHOOK_URL is set', async () => {
    const service = createAlertService({
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com/test',
    });

    await service.send('warning', 'title', 'body');

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toBe('https://hooks.slack.com/test');
  });
});
