// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ITeleporterMessenger, TeleporterFeeInfo, TeleporterMessageInput} from "./ITeleporter.sol";
import {IPocketMarketView, TradeReceipt} from "./TradeReceipt.sol";

/// @notice Lives on C-Chain next to the market. Sends each closed position's result to the
///         Pocket L1 over ICM. The receipt is read from the market's own storage, never taken
///         from the caller, so anyone may publish but nobody can forge a result.
contract ReceiptPublisher is Ownable {
    error StillOpen();
    error AlreadyPublished();
    error BookNotSet();
    error BookAlreadySet();

    event Published(uint256 indexed positionId, bytes32 indexed messageId);
    event BookSet(address book);

    uint256 public constant RECEIVE_GAS_LIMIT = 300_000;

    ITeleporterMessenger public immutable messenger;
    IPocketMarketView public immutable market;
    bytes32 public immutable destinationBlockchainId;
    address public book;
    mapping(uint256 => bytes32) public messageIdOf;

    constructor(ITeleporterMessenger messenger_, IPocketMarketView market_, bytes32 destinationBlockchainId_, address owner_)
        Ownable(owner_)
    {
        messenger = messenger_;
        market = market_;
        destinationBlockchainId = destinationBlockchainId_;
    }

    /// @dev The book lives on the L1 and is deployed after this contract, so it is wired once.
    function setBook(address book_) external onlyOwner {
        if (book != address(0)) revert BookAlreadySet();
        book = book_;
        emit BookSet(book_);
    }

    function publish(uint256 positionId) external returns (bytes32 messageId) {
        if (book == address(0)) revert BookNotSet();
        if (messageIdOf[positionId] != bytes32(0)) revert AlreadyPublished();

        (
            address owner_,
            bool isLong,
            bool open,
            uint64 openedAt,
            uint128 margin,
            uint128 entryPrice,
            ,
            ,
            uint128 exitPrice,
            uint128 payout,
            uint64 closedAt,
            bool closedByTrigger
        ) = market.positions(positionId);
        if (open || closedAt == 0) revert StillOpen();

        TradeReceipt memory r = TradeReceipt({
            positionId: positionId,
            owner: owner_,
            isLong: isLong,
            closedByTrigger: closedByTrigger,
            openedAt: openedAt,
            closedAt: closedAt,
            margin: margin,
            entryPrice: entryPrice,
            exitPrice: exitPrice,
            payout: payout
        });

        messageId = messenger.sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: destinationBlockchainId,
                destinationAddress: book,
                feeInfo: TeleporterFeeInfo({feeTokenAddress: address(0), amount: 0}),
                requiredGasLimit: RECEIVE_GAS_LIMIT,
                allowedRelayerAddresses: new address[](0),
                message: abi.encode(r)
            })
        );
        messageIdOf[positionId] = messageId;
        emit Published(positionId, messageId);
    }
}
