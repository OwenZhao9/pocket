// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PocketMarket} from "../src/PocketMarket.sol";
import {PocketUSD} from "../src/PocketUSD.sol";
import {ITeleporterMessenger, TeleporterMessageInput} from "../src/icm/ITeleporter.sol";
import {IPocketMarketView} from "../src/icm/TradeReceipt.sol";
import {ReceiptPublisher} from "../src/icm/ReceiptPublisher.sol";
import {ReceiptBook} from "../src/icm/ReceiptBook.sol";
import {MockPriceSource} from "./PocketMarket.t.sol";

/// Stands in for Teleporter on both chains: records the send, and lets the test "relay" it.
contract MockMessenger is ITeleporterMessenger {
    bytes32 public constant C_CHAIN = keccak256("c-chain");
    TeleporterMessageInput internal last;
    address internal lastSender;
    uint256 internal nonce;

    function sendCrossChainMessage(TeleporterMessageInput calldata input) external returns (bytes32) {
        last = input;
        lastSender = msg.sender;
        return keccak256(abi.encode(++nonce));
    }

    function relay() external {
        ReceiptBook(last.destinationAddress).receiveTeleporterMessage(C_CHAIN, lastSender, last.message);
    }
}

contract ReceiptsTest is Test {
    PocketUSD usd;
    MockPriceSource oracle;
    PocketMarket market;
    MockMessenger messenger;
    ReceiptPublisher publisher;
    ReceiptBook book;
    address alice = makeAddr("alice");
    bytes32 constant L1 = keccak256("pocket-l1");

    function setUp() public {
        vm.warp(1_000_000);
        usd = new PocketUSD(address(this));
        oracle = new MockPriceSource();
        oracle.set(20e8);
        market = new PocketMarket(usd, oracle, 1 days, 1e5, 1_000e6, address(this));
        usd.mint(address(market), 10_000e6);
        usd.mint(alice, 100e6);
        vm.prank(alice);
        usd.approve(address(market), type(uint256).max);

        messenger = new MockMessenger();
        publisher = new ReceiptPublisher(messenger, IPocketMarketView(address(market)), L1, address(this));
        book = new ReceiptBook(address(messenger), messenger.C_CHAIN(), address(publisher));
        publisher.setBook(address(book));
    }

    function _tradeAndClose(uint256 exit) internal returns (uint256 id) {
        vm.prank(alice);
        id = market.open(true, 10e6, 0, 0);
        oracle.set(exit);
        vm.prank(alice);
        market.close(id);
    }

    function test_ClosedTradeArrivesOnL1WithSettledResult() public {
        uint256 id = _tradeAndClose(22e8);
        publisher.publish(id);
        messenger.relay();

        (uint256 pid, address owner,,,,,, uint128 entry, uint128 exit, uint128 payout) = book.receipts(id);
        assertEq(pid, id);
        assertEq(owner, alice);
        assertEq(entry, 20e8);
        assertEq(exit, 22e8);
        assertEq(payout, 11e6);
        (uint64 trades, uint64 wins,, int256 net) = book.statsOf(alice);
        assertEq(trades, 1);
        assertEq(wins, 1);
        assertEq(net, 1e6);
    }

    function test_CannotPublishOpenPosition() public {
        vm.prank(alice);
        uint256 id = market.open(true, 10e6, 0, 0);
        vm.expectRevert(ReceiptPublisher.StillOpen.selector);
        publisher.publish(id);
    }

    function test_CannotPublishTwice() public {
        uint256 id = _tradeAndClose(18e8);
        publisher.publish(id);
        vm.expectRevert(ReceiptPublisher.AlreadyPublished.selector);
        publisher.publish(id);
    }

    function test_BookRejectsAnyoneButTheMessenger() public {
        bytes32 cChain = messenger.C_CHAIN();
        vm.expectRevert(ReceiptBook.UnauthorizedMessenger.selector);
        book.receiveTeleporterMessage(cChain, address(publisher), "");
    }

    function test_BookRejectsOtherSenders() public {
        bytes32 cChain = messenger.C_CHAIN();
        vm.prank(address(messenger));
        vm.expectRevert(ReceiptBook.UnauthorizedSource.selector);
        book.receiveTeleporterMessage(cChain, alice, "");
    }

    function test_BookCanOnlyBeSetOnce() public {
        vm.expectRevert(ReceiptPublisher.BookAlreadySet.selector);
        publisher.setBook(alice);
    }
}
