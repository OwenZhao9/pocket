"""Writes the ICM relayer config (C-Chain -> Pocket L1) from .env and config/*.json.

The relayer key comes from the environment, so the generated file must stay out of git.
"""
import json
import os
import sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fuji = json.load(open(os.path.join(root, "config/fuji.json")))
l1 = json.load(open(os.path.join(root, "config/pocket-l1.json")))
state = os.path.expanduser("~/.avalanche-cli/pocket")

config = {
    "log-level": "info",
    "info-api": {"base-url": "https://api.avax-test.network"},
    "p-chain-api": {"base-url": "https://api.avax-test.network"},
    "storage-location": os.path.join(state, "relayer-storage"),
    "api-port": 8090,
    "metrics-port": 9095,
    # The local validator advertises 127.0.0.1, which public peers do not gossip.
    "allow-private-ips": True,
    "manually-tracked-peers": [{"id": l1["validator"], "ip": "127.0.0.1:9651"}],
    "source-blockchains": [
        {
            "subnet-id": "11111111111111111111111111111111LpoYY",
            "blockchain-id": "yH8D7ThNJkxmtkuv2jgBa4P1Rn3Qpr4pPr7QYNfcdoS6k6HWp",
            "rpc-endpoint": {"base-url": "https://api.avax-test.network/ext/bc/C/rpc"},
            "ws-endpoint": {"base-url": "wss://api.avax-test.network/ext/bc/C/ws"},
            "message-contracts": {
                fuji["teleporterMessenger"]: {
                    "message-format": "teleporter",
                    "settings": {"reward-address": os.environ["RELAYER_ADDRESS"]},
                }
            },
            "supported-destinations": [{"blockchain-id": l1["blockchainId"]}],
            "allowed-origin-sender-addresses": [fuji["receiptPublisher"]],
        }
    ],
    "destination-blockchains": [
        {
            "subnet-id": l1["subnetId"],
            "blockchain-id": l1["blockchainId"],
            "rpc-endpoint": {"base-url": l1["rpc"]},
            "account-private-key": os.environ["RELAYER_PRIVATE_KEY"],
        }
    ],
}

json.dump(config, sys.stdout, indent=2)
