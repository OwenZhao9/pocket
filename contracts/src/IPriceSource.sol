// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice USD price of a market's asset, scaled to 8 decimals.
/// @dev Venue-agnostic so the market can swap oracles (Chainlink today, Pyth later)
///      and the same contracts can be reused on other EVM chains.
interface IPriceSource {
    function latest() external view returns (uint256 price, uint256 updatedAt);
}
