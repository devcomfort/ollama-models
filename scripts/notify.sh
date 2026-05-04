#!/usr/bin/env bash
set -euo pipefail

CHANNEL="${1:-both}"
SEVERITY="${2:-warning}"
TITLE="$3"
BODY="$4"

if [ $# -lt 3 ]; then
  echo "Usage: notify.sh <slack|discord|both> <severity> <title> [body]" >&2
  exit 1
fi

notify_slack() {
  [ -z "${SLACK_WEBHOOK_URL:-}" ] && return 0
  curl -sS -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg title "$TITLE" --arg body "$BODY" '{text: "\($title)\n\($body)"}')" || true
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
