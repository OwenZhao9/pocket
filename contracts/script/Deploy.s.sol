// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PocketUSD} from "../src/PocketUSD.sol";
import {ChainlinkPriceSource} from "../src/ChainlinkPriceSource.sol";
import {PocketMarket} from "../src/PocketMarket.sol";

/// Deploys pUSD, the AVAX/USD price source and the market, then seeds the pool.
/// Env: DEPLOYER_PRIVATE_KEY, PRICE_FEED (Chainlink aggregator), OUT (json path)
contract Deploy is Script {
    uint256 constant ONE = 1e6;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address feed = vm.envAddress("PRICE_FEED");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        PocketUSD usd = new PocketUSD(deployer);
        ChainlinkPriceSource source = new ChainlinkPriceSource(feed);
        PocketMarket market = new PocketMarket(usd, source, 1 hours, ONE / 10, 1_000 * ONE, deployer);
        usd.mint(deployer, 1_000_000 * ONE);
        usd.transfer(address(market), 200_000 * ONE);
        vm.stopBroadcast();

        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "deployBlock", block.number);
        vm.serializeAddress(o, "pocketUSD", address(usd));
        vm.serializeAddress(o, "priceSource", address(source));
        vm.serializeAddress(o, "priceFeed", feed);
        string memory json = vm.serializeAddress(o, "market", address(market));
        vm.writeJson(json, vm.envString("OUT"));

        console.log("pUSD   ", address(usd));
        console.log("source ", address(source));
        console.log("market ", address(market));
    }
}
