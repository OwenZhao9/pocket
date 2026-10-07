// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PocketMarket} from "../src/PocketMarket.sol";
import {PocketUSD} from "../src/PocketUSD.sol";
import {IPriceSource} from "../src/IPriceSource.sol";

contract MockPriceSource is IPriceSource {
    uint256 public price;
    uint256 public updatedAt;

    function set(uint256 price_) external {
        price = price_;
        updatedAt = block.timestamp;
    }

    function setStale(uint256 updatedAt_) external {
        updatedAt = updatedAt_;
    }

    function latest() external view returns (uint256, uint256) {
        return (price, updatedAt);
    }
}

contract PocketMarketTest is Test {
    PocketUSD usd;
    MockPriceSource oracle;
    PocketMarket market;

    address owner = makeAddr("owner");
    uint256 alicePk = 0xA11CE;
    address alice = vm.addr(alicePk);
    address keeper = makeAddr("keeper");

    uint256 constant ONE = 1e6; // pUSD has 6 decimals
    uint256 constant P = 20e8; // $20.00

    function setUp() public {
        vm.warp(1_000_000);
        usd = new PocketUSD(owner);
        oracle = new MockPriceSource();
        oracle.set(P);
        market = new PocketMarket(usd, oracle, 1 days, ONE / 10, 1_000 * ONE, owner);

        vm.startPrank(owner);
        usd.mint(address(market), 10_000 * ONE); // pool
        usd.mint(alice, 1_000 * ONE);
        vm.stopPrank();

        vm.prank(alice);
        usd.approve(address(market), type(uint256).max);
    }

    function _open(bool isLong, uint256 margin) internal returns (uint256) {
        vm.prank(alice);
        return market.open(isLong, margin, 0, 0);
    }

    function _closeAt(uint256 id, uint256 price) internal returns (uint256 received) {
        oracle.set(price);
        uint256 before = usd.balanceOf(alice);
        vm.prank(alice);
        market.close(id);
        received = usd.balanceOf(alice) - before;
    }

    // ------------------------------------------------------------ payouts

    function test_LongWinsWhenPriceRises() public {
        uint256 id = _open(true, 10 * ONE);
        assertEq(_closeAt(id, 22e8), 11 * ONE); // +10%
    }

    function test_LongLosesWhenPriceFalls() public {
        uint256 id = _open(true, 10 * ONE);
        assertEq(_closeAt(id, 18e8), 9 * ONE); // -10%
    }

    function test_ShortWinsWhenPriceFalls() public {
        uint256 id = _open(false, 10 * ONE);
        assertEq(_closeAt(id, 18e8), 11 * ONE);
    }

    function test_ShortLosesWhenPriceRises() public {
        uint256 id = _open(false, 10 * ONE);
        assertEq(_closeAt(id, 22e8), 9 * ONE);
    }

    function test_PayoutCappedAtTwiceMargin() public {
        uint256 id = _open(true, 10 * ONE);
        assertEq(_closeAt(id, 100e8), 20 * ONE);
    }

    function test_ShortWipedOutPaysZero() public {
        uint256 id = _open(false, 10 * ONE);
        assertEq(_closeAt(id, 50e8), 0);
    }

    function test_FlatPriceReturnsMargin() public {
        uint256 id = _open(true, 10 * ONE);
        assertEq(_closeAt(id, P), 10 * ONE);
    }

    // ------------------------------------------------------------ access

    function test_OnlyOwnerCanClose() public {
        uint256 id = _open(true, 10 * ONE);
        vm.prank(keeper);
        vm.expectRevert(PocketMarket.NotPositionOwner.selector);
        market.close(id);
    }

    function test_CannotCloseTwice() public {
        uint256 id = _open(true, 10 * ONE);
        _closeAt(id, P);
        vm.prank(alice);
        vm.expectRevert(PocketMarket.PositionClosed.selector);
        market.close(id);
    }

    // ------------------------------------------------------------ triggers

    function test_KeeperExecutesTakeProfitAndOwnerGetsPaid() public {
        vm.prank(alice);
        uint256 id = market.open(true, 10 * ONE, 22e8, 18e8);

        oracle.set(21e8);
        vm.prank(keeper);
        vm.expectRevert(PocketMarket.TriggerNotReached.selector);
        market.executeTrigger(id);

        oracle.set(22e8);
        uint256 before = usd.balanceOf(alice);
        vm.prank(keeper);
        market.executeTrigger(id);
        assertEq(usd.balanceOf(alice) - before, 11 * ONE);
        assertEq(usd.balanceOf(keeper), 0);
    }

    function test_KeeperExecutesStopLossOnShort() public {
        vm.prank(alice);
        uint256 id = market.open(false, 10 * ONE, 0, 21e8);
        oracle.set(21e8);
        assertTrue(market.triggerReached(id));
        vm.prank(keeper);
        market.executeTrigger(id);
        (,, bool isOpen,,,,,, uint128 exitPrice, uint128 payout,, bool byTrigger) = market.positions(id);
        assertFalse(isOpen);
        assertEq(exitPrice, 21e8);
        assertEq(payout, 9.5e6);
        assertTrue(byTrigger);
    }

    function test_InvalidTriggersRejected() public {
        vm.startPrank(alice);
        vm.expectRevert(PocketMarket.InvalidTriggers.selector);
        market.open(true, 10 * ONE, 19e8, 0); // long TP below entry
        vm.expectRevert(PocketMarket.InvalidTriggers.selector);
        market.open(false, 10 * ONE, 0, 19e8); // short SL below entry
        vm.stopPrank();
    }

    function test_OwnerCanSetTriggersLater() public {
        uint256 id = _open(true, 10 * ONE);
        vm.prank(alice);
        market.setTriggers(id, 25e8, 15e8);
        (,,,,,, uint128 tp, uint128 sl,,,,) = market.positions(id);
        assertEq(tp, 25e8);
        assertEq(sl, 15e8);

        vm.prank(keeper);
        vm.expectRevert(PocketMarket.NotPositionOwner.selector);
        market.setTriggers(id, 0, 0);
    }

    // ------------------------------------------------------------ oracle

    function test_StalePriceBlocksTrading() public {
        oracle.setStale(block.timestamp - 1 days - 1);
        vm.prank(alice);
        vm.expectRevert();
        market.open(true, 10 * ONE, 0, 0);
    }

    // ------------------------------------------------------------ liquidity

    function test_CannotOpenBeyondFreeLiquidity() public {
        // 10,000 pool reserves 2x margin per position, so 5,000 of margin fits at most.
        vm.prank(owner);
        market.setConfig(oracle, 1 days, ONE / 10, 100_000 * ONE);
        vm.prank(owner);
        usd.mint(alice, 100_000 * ONE);
        vm.prank(alice);
        vm.expectRevert(PocketMarket.InsufficientLiquidity.selector);
        market.open(true, 10_001 * ONE, 0, 0);
    }

    function test_OwnerCannotWithdrawReservedLiquidity() public {
        _open(true, 100 * ONE);
        uint256 free = market.freeLiquidity();
        vm.prank(owner);
        vm.expectRevert(PocketMarket.InsufficientLiquidity.selector);
        market.withdrawLiquidity(owner, free + 1);
        vm.prank(owner);
        market.withdrawLiquidity(owner, free);
    }

    function test_MarginBounds() public {
        vm.startPrank(alice);
        vm.expectRevert(PocketMarket.MarginOutOfRange.selector);
        market.open(true, ONE / 10 - 1, 0, 0);
        vm.expectRevert(PocketMarket.MarginOutOfRange.selector);
        market.open(true, 1_000 * ONE + 1, 0, 0);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ permit

    function test_OpenWithPermitNeedsNoApproval() public {
        address bob;
        uint256 bobPk = 0xB0B;
        bob = vm.addr(bobPk);
        vm.prank(owner);
        usd.mint(bob, 50 * ONE);

        uint256 margin = 10 * ONE;
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                bob,
                address(market),
                margin,
                usd.nonces(bob),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usd.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(bobPk, digest);

        vm.prank(bob);
        uint256 id = market.openWithPermit(true, margin, 0, 0, deadline, v, r, s);
        assertEq(usd.balanceOf(bob), 40 * ONE);
        assertEq(market.positionsOf(bob)[0], id);
    }

    // ------------------------------------------------------------ solvency

    /// The pool must always be able to pay every open position in full.
    function testFuzz_PoolStaysSolvent(uint96 m1, uint96 m2, bool l1, bool l2, uint64 exitPrice) public {
        uint256 a = bound(uint256(m1), ONE / 10, 1_000 * ONE);
        uint256 b = bound(uint256(m2), ONE / 10, 1_000 * ONE);
        uint256 exit = bound(uint256(exitPrice), 1, 1_000e8);
        vm.prank(owner);
        usd.mint(alice, 2_000 * ONE);

        uint256 id1 = _open(l1, a);
        uint256 id2 = _open(l2, b);
        assertGe(usd.balanceOf(address(market)), 2 * market.lockedMargin());

        oracle.set(exit);
        vm.startPrank(alice);
        market.close(id1);
        assertGe(usd.balanceOf(address(market)), 2 * market.lockedMargin());
        market.close(id2);
        vm.stopPrank();
        assertEq(market.lockedMargin(), 0);
    }
}
