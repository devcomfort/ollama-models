/**
 * Tail Worker — receives real-time execution events from the API Worker.
 * Sends structured error alerts to a configured webhook (Slack, Discord, etc.)
 *
 * 워커의 실행 이벤트를 실시간으로 수신. 스크래퍼 실패 시 웹훅으로 알림 전송.
 *
 * To enable: add to api/wrangler.toml:
 *   [[tail_consumers]]
 *   service = "ollama-models-alerts"
 *
 * Required secrets (set via `wrangler secret put`):
 *   ALERT_WEBHOOK_URL — Slack/Discord/compatible webhook URL
 *
 * Optional (Cloudflare Email Service):
 *   ALERT_EMAIL_TO    — recipient email address
 *   Requires [[send_email]] binding in wrangler.toml + domain verification
 */
export default {
  async tail(events, env) {
    const webhookUrl = env.ALERT_WEBHOOK_URL;

    for (const event of events) {
      // Valid outcomes: 'ok' | 'exception' | 'exceededCpu' | 'exceededMemory' | 'unknown' | 'canceled'
      if (event.outcome === 'ok') continue;

      const errorMsg =
        event.exceptions?.[0]?.message ||
        event.logs?.filter((l) => l.level === 'error')?.map((l) => l.message)?.join('\n') ||
        'Unknown error';

      const lines = [
        `🚨 *Worker Error: ${event.scriptName}*`,
        `*Outcome:* ${event.outcome}`,
        `*URL:* ${event.event?.request?.url || 'N/A'}`,
        `*Method:* ${event.event?.request?.method || 'N/A'}`,
        `*Error:*`,
        '```' + errorMsg + '```',
        `*CPU Time:* ${event.cpuTime}ms`,
        `*Wall Time:* ${event.wallTime}ms`,
      ];

      // Fire-and-forget: never let alert failure affect the Worker
      // Webhook (Slack, Discord, etc.)
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: lines.join('\n') }),
          });
        } catch {
          // Silently swallow
        }
      }

      // Email (Cloudflare Email Service — requires [[send_email]] binding)
      if (env.ALERT_EMAIL_TO && env.EMAIL) {
        try {
          await env.EMAIL.send({
            to: env.ALERT_EMAIL_TO,
            from: `alerts@${new URL(event.event?.request?.url || 'https://example.com').hostname}`,
            subject: `[${event.outcome}] ollama-models error`,
            text: lines.join('\n').replace(/\*|```/g, ''),
          });
        } catch {
          // Silently swallow
        }
      }
    }
  },
};
