#!/usr/bin/env bash
# Brings the Pocket L1 validator and the C-Chain -> L1 ICM relayer back up, e.g. after a reboot.
# Messages published while they were down are delivered on restart (process-missed-blocks).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
export PATH="$HOME/bin:$PATH"
STATE="$HOME/.avalanche-cli/pocket"
mkdir -p "$STATE"
RPC=$(python3 -c "import json;print(json.load(open('config/pocket-l1.json'))['rpc'])")

if ! curl -s -m 3 -X POST -H 'content-type:application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$RPC" | grep -q result; then
  avalanche node local start pocketl1-local-node-fuji --skip-update-check
  for _ in $(seq 1 60); do
    curl -s -m 3 -X POST -H 'content-type:application/json' \
      --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$RPC" | grep -q result && break
    sleep 3
  done
fi
echo "Pocket L1 is up: $RPC"

if ! pgrep -f relayer-loop.sh >/dev/null; then
  pkill -f icm-relayer-1.8.2 || true
  umask 077
  python3 ops/relayer-config.py > "$STATE/relayer-config.json"
  nohup ops/relayer-loop.sh "$STATE/relayer-config.json" "$STATE/relayer.log" >/dev/null 2>&1 &
fi
# The relayer pulls Fuji's full validator set from the public P-Chain API on start; that call
# sometimes times out and is retried, so give it a few minutes before reporting.
for _ in $(seq 1 60); do
  if curl -s -m 2 127.0.0.1:8090/health | grep -q '"network-all":{"status":"up"'; then
    echo "ICM relayer is up (log: $STATE/relayer.log)"; exit 0
  fi
  sleep 3
done
echo "ICM relayer started but not healthy yet; check $STATE/relayer.log" >&2
