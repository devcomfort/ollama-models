/**
 * Tail Worker — receives real-time execution events from the API Worker.
 * Sends error alerts via Cloudflare Email Service.
 *
 * Required secret (set via `wrangler secret put`):
 *   ALERT_EMAIL_TO — recipient email address
 */
const FROM_DOMAIN = 'ollama.devcomfort.me';

export default {
  async tail(events, env) {
    const emailTo = env.ALERT_EMAIL_TO;
    if (!emailTo || !env.EMAIL) return;

    for (const event of events) {
      if (event.outcome === 'ok') continue;

      const errorMsg =
        event.exceptions?.[0]?.message ||
        event.logs?.filter((l) => l.level === 'error')?.map((l) => l.message)?.join('\n') ||
        'Unknown error';

      try {
        await env.EMAIL.send({
          to: emailTo,
          from: `alerts@${FROM_DOMAIN}`,
          subject: `[${event.outcome}] ollama-models error`,
          text: [
            `Worker Error: ${event.scriptName}`,
            `Outcome: ${event.outcome}`,
            `URL: ${event.event?.request?.url || 'N/A'}`,
            `Error: ${errorMsg}`,
            `CPU: ${event.cpuTime}ms`,
          ].join('\n'),
        });
      } catch {
        // Silently swallow
      }
    }
  },
};
