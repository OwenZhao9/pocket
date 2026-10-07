// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITeleporterReceiver} from "./ITeleporter.sol";
import {TradeReceipt} from "./TradeReceipt.sol";

/// @notice Lives on the Pocket L1. Keeps every trader's settled results as a portable record.
///         Accepts messages only from the Teleporter messenger, only from C-Chain, and only
///         from the ReceiptPublisher there.
contract ReceiptBook is ITeleporterReceiver {
    error UnauthorizedMessenger();
    error UnauthorizedSource();
    error Duplicate();

    event ReceiptRecorded(uint256 indexed positionId, address indexed owner, int256 pnl, bool closedByTrigger);

    address public immutable messenger;
    bytes32 public immutable sourceBlockchainId;
    address public immutable publisher;

    mapping(uint256 => TradeReceipt) public receipts;
    mapping(address => uint256[]) private _byOwner;
    uint256 public count;

    struct Stats {
        uint64 trades;
        uint64 wins;
        uint64 byRule;
        int256 netPnl;
    }

    mapping(address => Stats) public statsOf;

    constructor(address messenger_, bytes32 sourceBlockchainId_, address publisher_) {
        messenger = messenger_;
        sourceBlockchainId = sourceBlockchainId_;
        publisher = publisher_;
    }

    function receiveTeleporterMessage(bytes32 sourceBlockchainID, address originSenderAddress, bytes calldata message)
        external
    {
        if (msg.sender != messenger) revert UnauthorizedMessenger();
        if (sourceBlockchainID != sourceBlockchainId || originSenderAddress != publisher) revert UnauthorizedSource();

        TradeReceipt memory r = abi.decode(message, (TradeReceipt));
        if (receipts[r.positionId].owner != address(0)) revert Duplicate();
        receipts[r.positionId] = r;
        _byOwner[r.owner].push(r.positionId);
        count++;

        int256 pnl = int256(uint256(r.payout)) - int256(uint256(r.margin));
        Stats storage s = statsOf[r.owner];
        s.trades++;
        if (pnl > 0) s.wins++;
        if (r.closedByTrigger) s.byRule++;
        s.netPnl += pnl;

        emit ReceiptRecorded(r.positionId, r.owner, pnl, r.closedByTrigger);
    }

    function receiptsOf(address owner) external view returns (uint256[] memory) {
        return _byOwner[owner];
    }
}
