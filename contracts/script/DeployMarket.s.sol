// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPriceSource} from "../src/IPriceSource.sol";
import {PocketMarket} from "../src/PocketMarket.sol";

/// Deploys a market against the existing pUSD and price source, and seeds its pool.
/// Env: DEPLOYER_PRIVATE_KEY, OUT (deployment json), POOL (pUSD atomic units)
contract DeployMarket is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        string memory out = vm.envString("OUT");
        string memory json = vm.readFile(out);
        IERC20 usd = IERC20(vm.parseJsonAddress(json, ".pocketUSD"));
        IPriceSource source = IPriceSource(vm.parseJsonAddress(json, ".priceSource"));

        vm.startBroadcast(pk);
        PocketMarket market = new PocketMarket(usd, source, 1 hours, 1e5, 1_000e6, vm.addr(pk));
        usd.transfer(address(market), vm.envUint("POOL"));
        vm.stopBroadcast();

        vm.writeJson(vm.toString(address(market)), out, ".market");
        vm.writeJson(vm.toString(block.number), out, ".deployBlock");
        console.log("market ", address(market));
    }
}
