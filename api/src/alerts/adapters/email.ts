import type { AlertChannel } from '../types';

export class EmailChannel implements AlertChannel {
  constructor(private webhookUrl: string) {}

  async send(severity: 'warning' | 'critical', title: string, body: string): Promise<void> {
    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'alerts@example.com',
        subject: `[${severity.toUpperCase()}] ${title}`,
        body: `${title}\n\n${body}`,
      }),
    });
  }
}
