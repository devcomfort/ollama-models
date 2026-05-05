#!/usr/bin/env bash
set -euo pipefail

CHANNEL="${1:-slack}"
SEVERITY="${2:-warning}"
TITLE="$3"
BODY="$4"

if [ $# -lt 3 ]; then
  echo "Usage: notify.sh <slack|discord|both> <info|warning|critical> <title> <body>" >&2
  exit 1
fi

notify_slack() {
  [ -z "${SLACK_WEBHOOK_URL:-}" ] && return 0

  local emoji color
  case "$SEVERITY" in
    critical) emoji=":red_circle:" color="#E01E5A" ;;
    warning)  emoji=":warning:"    color="#ECB22E" ;;
    *)        emoji=":white_check_mark:" color="#2EB67D" ;;
  esac

  local run_url="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-unknown}/actions/runs/${GITHUB_RUN_ID:-?}"
  local job="${GITHUB_JOB:-unknown}"
  local branch="${GITHUB_REF_NAME:-unknown}"

  curl -sS -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n \
      --arg emoji "$emoji" \
      --arg title "$TITLE" \
      --arg body "$BODY" \
      --arg color "$color" \
      --arg job "$job" \
      --arg branch "$branch" \
      --arg run_url "$run_url" \
      '{
        text: "\($emoji) \($title)",
        attachments: [{
          color: $color,
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: $body } },
            { type: "context", elements: [
              { type: "mrkdwn", text: "*Job:* \($job)  |  *Branch:* \($branch)  |  <\($run_url)|View Run>" }
            ]}
          ]
        }]
      }')" || true
}

notify_discord() {
  [ -z "${DISCORD_WEBHOOK_URL:-}" ] && return 0
  local color
  case "$SEVERITY" in
    critical) color=15548997 ;;
    warning)  color=16763904 ;;
    *)        color=5814783 ;;
  esac
  curl -sS -X POST "$DISCORD_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg title "$TITLE" --arg desc "$BODY" --argjson color "$color" \
      '{embeds: [{title: $title, description: $desc, color: $color}]}')" || true
}

case "$CHANNEL" in
  slack)   notify_slack ;;
  discord) notify_discord ;;
  both)    notify_slack; notify_discord ;;
  *)       echo "Unknown channel: $CHANNEL (use slack, discord, or both)" >&2; exit 1 ;;
esac
