// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The settled result of one closed position, as carried over ICM.
struct TradeReceipt {
    uint256 positionId;
    address owner;
    bool isLong;
    bool closedByTrigger;
    uint64 openedAt;
    uint64 closedAt;
    uint128 margin;
    uint128 entryPrice;
    uint128 exitPrice;
    uint128 payout;
}

interface IPocketMarketView {
    function positions(uint256 id)
        external
        view
        returns (
            address owner,
            bool isLong,
            bool open,
            uint64 openedAt,
            uint128 margin,
            uint128 entryPrice,
            uint128 takeProfit,
            uint128 stopLoss,
            uint128 exitPrice,
            uint128 payout,
            uint64 closedAt,
            bool closedByTrigger
        );
}
