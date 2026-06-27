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
 */
export default {
  async tail(events, env) {
    const webhookUrl = env.ALERT_WEBHOOK_URL;
    if (!webhookUrl) return;

    for (const event of events) {
      // Only alert on errors/exceptions, not successful requests
      if (event.outcome !== 'exception' && event.outcome !== 'error') continue;

      const errorMsg =
        event.exceptions?.[0]?.message ||
        event.logs?.filter((l) => l.level === 'error')?.map((l) => l.message)?.join('\n') ||
        'Unknown error';

      const text = [
        `🚨 *Worker Error: ${event.scriptName}*`,
        `*Outcome:* ${event.outcome}`,
        `*URL:* ${event.event?.request?.url || 'N/A'}`,
        `*Method:* ${event.event?.request?.method || 'N/A'}`,
        `*Error:*`,
        '```' + errorMsg + '```',
        `*CPU Time:* ${event.cpuTime}ms`,
        `*Wall Time:* ${event.wallTime}ms`,
      ].join('\n');

      // Fire-and-forget: never let alert failure affect the Worker
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
      } catch {
        // Silently swallow — alert failure must not interfere
      }
    }
  },
};
