import type { AlertChannel } from '../types';

export class SlackChannel implements AlertChannel {
  constructor(private webhookUrl: string) {}

  async send(_severity: 'warning' | 'critical', title: string, body: string): Promise<void> {
    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `*${title}*\n${body}` }),
    });
  }
}
