#!/bin/zsh
setopt NO_BGNICE
cd "$(dirname "$0")"
causal_url="http://127.0.0.1:${PORT:-8885}/"
(
  for causal_attempt in {1..40}; do
    if curl --silent --fail --max-time 0.5 "$causal_url" >/dev/null; then
      open "$causal_url"
      exit 0
    fi
    sleep 0.25
  done
) &
node server.mjs
