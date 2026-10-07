// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IPriceSource} from "./IPriceSource.sol";

/// @title PocketMarket
/// @notice Up/down positions on one asset at 1x exposure, settled against an oracle.
///         The contract's own liquidity pool is the counterparty.
///
///         Payout = margin +/- margin * priceMove, clamped to [0, 2 * margin].
///         The pool always reserves 2x every open margin, so every position can be paid in full.
///
///         Take-profit and stop-loss levels live on-chain. Anyone may execute a trigger,
///         but only when the oracle price has crossed the level, and the payout always goes
///         to the position owner. An off-chain keeper therefore holds no authority over funds.
contract PocketMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    struct Position {
        address owner;
        bool isLong;
        bool open;
        uint64 openedAt;
        uint128 margin;
        uint128 entryPrice;
        uint128 takeProfit; // 8 decimals, 0 = unset
        uint128 stopLoss; // 8 decimals, 0 = unset
    }

    error StalePrice(uint256 updatedAt);
    error MarginOutOfRange();
    error InsufficientLiquidity();
    error NotPositionOwner();
    error PositionClosed();
    error InvalidTriggers();
    error TriggerNotReached();

    event Opened(
        uint256 indexed id, address indexed owner, bool isLong, uint256 margin, uint256 entryPrice
    );
    event TriggersSet(uint256 indexed id, uint256 takeProfit, uint256 stopLoss);
    event Closed(
        uint256 indexed id,
        address indexed owner,
        uint256 exitPrice,
        uint256 payout,
        bool byTrigger,
        address executor
    );
    event LiquidityWithdrawn(address indexed to, uint256 amount);
    event ConfigUpdated(address priceSource, uint256 maxPriceAge, uint256 minMargin, uint256 maxMargin);

    IERC20 public immutable collateral;
    IPriceSource public priceSource;
    uint256 public maxPriceAge;
    uint256 public minMargin;
    uint256 public maxMargin;

    /// @notice Sum of margins of all open positions.
    uint256 public lockedMargin;
    uint256 public nextId;
    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) private _positionsOf;

    constructor(
        IERC20 collateral_,
        IPriceSource priceSource_,
        uint256 maxPriceAge_,
        uint256 minMargin_,
        uint256 maxMargin_,
        address owner_
    ) Ownable(owner_) {
        collateral = collateral_;
        _setConfig(priceSource_, maxPriceAge_, minMargin_, maxMargin_);
    }

    // ---------------------------------------------------------------- trading

    function open(bool isLong, uint256 margin, uint256 takeProfit, uint256 stopLoss)
        external
        nonReentrant
        returns (uint256 id)
    {
        return _open(msg.sender, isLong, margin, takeProfit, stopLoss);
    }

    /// @notice One-transaction open: permit and open together, so a new user never sends a
    ///         separate approval. A failed permit is ignored in case it was front-run; the
    ///         transfer then succeeds or fails on the allowance alone.
    function openWithPermit(
        bool isLong,
        uint256 margin,
        uint256 takeProfit,
        uint256 stopLoss,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 id) {
        try IERC20Permit(address(collateral)).permit(msg.sender, address(this), margin, deadline, v, r, s) {}
            catch {}
        return _open(msg.sender, isLong, margin, takeProfit, stopLoss);
    }

    function close(uint256 id) external nonReentrant {
        Position storage p = positions[id];
        if (p.owner != msg.sender) revert NotPositionOwner();
        (uint256 price,) = _price();
        _close(id, p, price, false);
    }

    function setTriggers(uint256 id, uint256 takeProfit, uint256 stopLoss) external {
        Position storage p = positions[id];
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (!p.open) revert PositionClosed();
        _validateTriggers(p.isLong, p.entryPrice, takeProfit, stopLoss);
        p.takeProfit = takeProfit.toUint128();
        p.stopLoss = stopLoss.toUint128();
        emit TriggersSet(id, takeProfit, stopLoss);
    }

    /// @notice Callable by anyone. Succeeds only if the oracle price has crossed a trigger.
    function executeTrigger(uint256 id) external nonReentrant {
        Position storage p = positions[id];
        if (!p.open) revert PositionClosed();
        (uint256 price,) = _price();
        if (!_triggerReached(p, price)) revert TriggerNotReached();
        _close(id, p, price, true);
    }

    // ------------------------------------------------------------------ views

    function freeLiquidity() public view returns (uint256) {
        uint256 balance = collateral.balanceOf(address(this));
        uint256 reserved = 2 * lockedMargin;
        return balance > reserved ? balance - reserved : 0;
    }

    function positionsOf(address owner_) external view returns (uint256[] memory) {
        return _positionsOf[owner_];
    }

    /// @notice What the position would pay if closed now, and the price used.
    function quote(uint256 id) external view returns (uint256 payout, uint256 price, uint256 updatedAt) {
        Position storage p = positions[id];
        if (!p.open) revert PositionClosed();
        (price, updatedAt) = priceSource.latest();
        payout = _payout(p.isLong, p.margin, p.entryPrice, price);
    }

    function triggerReached(uint256 id) external view returns (bool) {
        Position storage p = positions[id];
        if (!p.open) return false;
        (uint256 price, uint256 updatedAt) = priceSource.latest();
        if (block.timestamp - updatedAt > maxPriceAge) return false;
        return _triggerReached(p, price);
    }

    // ------------------------------------------------------------------ owner

    function setConfig(IPriceSource priceSource_, uint256 maxPriceAge_, uint256 minMargin_, uint256 maxMargin_)
        external
        onlyOwner
    {
        _setConfig(priceSource_, maxPriceAge_, minMargin_, maxMargin_);
    }

    /// @notice Pool liquidity can only leave down to the 2x reserve of open positions.
    function withdrawLiquidity(address to, uint256 amount) external onlyOwner {
        if (amount > freeLiquidity()) revert InsufficientLiquidity();
        collateral.safeTransfer(to, amount);
        emit LiquidityWithdrawn(to, amount);
    }

    // --------------------------------------------------------------- internal

    function _open(address owner_, bool isLong, uint256 margin, uint256 takeProfit, uint256 stopLoss)
        internal
        returns (uint256 id)
    {
        if (margin < minMargin || margin > maxMargin) revert MarginOutOfRange();
        if (margin > freeLiquidity()) revert InsufficientLiquidity();
        (uint256 price,) = _price();
        _validateTriggers(isLong, price, takeProfit, stopLoss);

        id = nextId++;
        positions[id] = Position({
            owner: owner_,
            isLong: isLong,
            open: true,
            openedAt: uint64(block.timestamp),
            margin: margin.toUint128(),
            entryPrice: price.toUint128(),
            takeProfit: takeProfit.toUint128(),
            stopLoss: stopLoss.toUint128()
        });
        _positionsOf[owner_].push(id);
        lockedMargin += margin;
        emit Opened(id, owner_, isLong, margin, price);
        if (takeProfit != 0 || stopLoss != 0) emit TriggersSet(id, takeProfit, stopLoss);

        collateral.safeTransferFrom(owner_, address(this), margin);
    }

    function _close(uint256 id, Position storage p, uint256 price, bool byTrigger) internal {
        if (!p.open) revert PositionClosed();
        uint256 payout = _payout(p.isLong, p.margin, p.entryPrice, price);
        p.open = false;
        lockedMargin -= p.margin;
        emit Closed(id, p.owner, price, payout, byTrigger, msg.sender);
        if (payout > 0) collateral.safeTransfer(p.owner, payout);
    }

    function _price() internal view returns (uint256 price, uint256 updatedAt) {
        (price, updatedAt) = priceSource.latest();
        if (block.timestamp - updatedAt > maxPriceAge) revert StalePrice(updatedAt);
    }

    function _payout(bool isLong, uint256 margin, uint256 entry, uint256 price) internal pure returns (uint256) {
        bool up = price >= entry;
        uint256 move = up ? price - entry : entry - price;
        uint256 delta = margin * move / entry;
        if (delta > margin) delta = margin;
        bool wins = (isLong == up);
        return wins ? margin + delta : margin - delta;
    }

    function _triggerReached(Position storage p, uint256 price) internal view returns (bool) {
        if (p.isLong) {
            return (p.takeProfit != 0 && price >= p.takeProfit) || (p.stopLoss != 0 && price <= p.stopLoss);
        }
        return (p.takeProfit != 0 && price <= p.takeProfit) || (p.stopLoss != 0 && price >= p.stopLoss);
    }

    function _validateTriggers(bool isLong, uint256 entry, uint256 takeProfit, uint256 stopLoss) internal pure {
        if (isLong) {
            if (takeProfit != 0 && takeProfit <= entry) revert InvalidTriggers();
            if (stopLoss != 0 && stopLoss >= entry) revert InvalidTriggers();
        } else {
            if (takeProfit != 0 && takeProfit >= entry) revert InvalidTriggers();
            if (stopLoss != 0 && stopLoss <= entry) revert InvalidTriggers();
        }
    }

    function _setConfig(IPriceSource priceSource_, uint256 maxPriceAge_, uint256 minMargin_, uint256 maxMargin_)
        internal
    {
        if (minMargin_ == 0 || minMargin_ > maxMargin_) revert MarginOutOfRange();
        priceSource = priceSource_;
        maxPriceAge = maxPriceAge_;
        minMargin = minMargin_;
        maxMargin = maxMargin_;
        emit ConfigUpdated(address(priceSource_), maxPriceAge_, minMargin_, maxMargin_);
    }
}
