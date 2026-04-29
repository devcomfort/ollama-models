import type { AlertChannel } from '../types';

export class DiscordChannel implements AlertChannel {
  constructor(private webhookUrl: string) {}

  async send(severity: 'warning' | 'critical', title: string, body: string): Promise<void> {
    const color = severity === 'critical' ? 16711680 : 16776960;

    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title,
          description: body,
          color,
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  }
}
