// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PocketFaucet} from "../src/PocketFaucet.sol";

/// Deploys the starter-kit faucet, funds it, and makes the server's keeper key its operator.
/// Env: DEPLOYER_PRIVATE_KEY, EXECUTOR_ADDRESS, USDC, OUT (existing deployment json)
contract DeployFaucet is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address executor = vm.envAddress("EXECUTOR_ADDRESS");
        string memory out = vm.envString("OUT");
        IERC20 usd = IERC20(vm.parseJsonAddress(vm.readFile(out), ".pocketUSD"));
        IERC20 usdc = IERC20(vm.envAddress("USDC"));

        vm.startBroadcast(pk);
        PocketFaucet faucet = new PocketFaucet(usd, usdc, 100e6, 0.05e6, 0.002 ether, vm.addr(pk));
        faucet.setOperator(executor, true);
        usd.transfer(address(faucet), 100_000e6);
        usdc.transfer(address(faucet), 19e6);
        payable(address(faucet)).transfer(0.25 ether);
        payable(executor).transfer(0.1 ether);
        vm.stopBroadcast();

        vm.writeJson(vm.toString(address(faucet)), out, ".faucet");
        vm.writeJson(vm.toString(address(usdc)), out, ".usdc");
        console.log("faucet ", address(faucet));
    }
}
