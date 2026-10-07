// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PocketFaucet} from "../src/PocketFaucet.sol";
import {PocketUSD} from "../src/PocketUSD.sol";

contract PocketFaucetTest is Test {
    PocketUSD usd;
    PocketUSD usdc; // stand-in for USDC; only ERC20 behaviour matters here
    PocketFaucet faucet;
    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    address payable newcomer = payable(makeAddr("newcomer"));

    function setUp() public {
        usd = new PocketUSD(owner);
        usdc = new PocketUSD(owner);
        faucet = new PocketFaucet(usd, usdc, 100e6, 0.05e6, 0.002 ether, owner);
        vm.startPrank(owner);
        usd.mint(address(faucet), 1_000e6);
        usdc.mint(address(faucet), 1e6);
        faucet.setOperator(operator, true);
        vm.stopPrank();
        vm.deal(address(faucet), 1 ether);
    }

    function test_DripGivesStarterKitOnce() public {
        vm.prank(operator);
        faucet.drip(newcomer);
        assertEq(usd.balanceOf(newcomer), 100e6);
        assertEq(usdc.balanceOf(newcomer), 0.05e6);
        assertEq(newcomer.balance, 0.002 ether);

        vm.prank(operator);
        vm.expectRevert(PocketFaucet.AlreadyClaimed.selector);
        faucet.drip(newcomer);
    }

    function test_OnlyOperatorCanDrip() public {
        vm.prank(newcomer);
        vm.expectRevert(PocketFaucet.NotOperator.selector);
        faucet.drip(newcomer);
    }

    function test_SkipsExhaustedPartsInsteadOfReverting() public {
        vm.prank(owner);
        faucet.withdraw(usdc, owner, 1e6);
        vm.prank(operator);
        faucet.drip(newcomer);
        assertEq(usd.balanceOf(newcomer), 100e6);
        assertEq(usdc.balanceOf(newcomer), 0);
    }
}
