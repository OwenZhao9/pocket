// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceSource} from "./IPriceSource.sol";

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @notice Adapts a Chainlink aggregator to IPriceSource.
contract ChainlinkPriceSource is IPriceSource {
    error InvalidPrice();

    AggregatorV3Interface public immutable feed;
    uint8 private immutable feedDecimals;

    constructor(address feed_) {
        feed = AggregatorV3Interface(feed_);
        feedDecimals = feed.decimals();
    }

    function latest() external view returns (uint256 price, uint256 updatedAt) {
        (, int256 answer,, uint256 updated,) = feed.latestRoundData();
        if (answer <= 0) revert InvalidPrice();
        uint256 raw = uint256(answer);
        if (feedDecimals > 8) price = raw / 10 ** (feedDecimals - 8);
        else price = raw * 10 ** (8 - feedDecimals);
        updatedAt = updated;
    }
}
