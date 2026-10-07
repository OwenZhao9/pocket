#!/usr/bin/env bash
# Keeps the ICM relayer running. It exits when its C-Chain websocket drops and cannot
# resubscribe in time; on restart it processes the blocks it missed, so nothing is lost.
CONFIG="$1"
LOG="$2"
while true; do
  "$HOME/.avalanche-cli/bin/icm-relayer-1.8.2" --config-file "$CONFIG" >> "$LOG" 2>&1
  echo "$(date '+%F %T') relayer exited with $?, restarting in 5s" >> "$LOG"
  sleep 5
done
