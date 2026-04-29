import type { AlertChannel } from './types';
import { SlackChannel } from './adapters/slack';
import { DiscordChannel } from './adapters/discord';
import { EmailChannel } from './adapters/email';

/**
 * Multi-channel alert dispatch facade.
 *
 * AlertService는 등록된 모든 채널에 대해 병렬로 알림을 발송하는 파사드 클래스다.
 * 한 채널의 실패가 다른 채널의 발송을 막지 않도록 Promise.allSettled를 사용한다.
 */
export class AlertService {
  constructor(private channels: AlertChannel[]) {}

  /**
   * Dispatch an alert to all registered channels in parallel.
   *
   * 모든 채널에 동시에 알림을 발송한다. 개별 채널 실패는 console.error로 로깅되며,
   * 호출자에게 예외를 전파하지 않는다(fire-and-forget).
   */
  async send(severity: 'warning' | 'critical', title: string, body: string): Promise<void> {
    const results = await Promise.allSettled(
      this.channels.map((ch) => ch.send(severity, title, body)),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Alert delivery failed:', result.reason);
      }
    }
  }
}

/**
 * Create an AlertService from environment webhook URLs.
 *
 * 환경 변수에서 웹훅 URL을 읽어 사용 가능한 채널만 포함한 AlertService를 생성한다.
 * 설정된 웹훅이 없으면 빈 채널 배열의 AlertService를 반환한다(no-op).
 */
export function createAlertService(env: {
  SLACK_WEBHOOK_URL?: string;
  DISCORD_WEBHOOK_URL?: string;
  EMAIL_WEBHOOK_URL?: string;
}): AlertService {
  const channels: AlertChannel[] = [];

  if (env.SLACK_WEBHOOK_URL) {
    channels.push(new SlackChannel(env.SLACK_WEBHOOK_URL));
  }
  if (env.DISCORD_WEBHOOK_URL) {
    channels.push(new DiscordChannel(env.DISCORD_WEBHOOK_URL));
  }
  if (env.EMAIL_WEBHOOK_URL) {
    channels.push(new EmailChannel(env.EMAIL_WEBHOOK_URL));
  }

  return new AlertService(channels);
}
