// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/// @notice Gives each new address a one-time starter kit in a single transaction:
///         trading dollars, a little gas, and a little USDC for pay-per-use features.
///         Only operators (the server's keeper key) may drip, and each address once,
///         so a compromised server key can drain at most what this contract holds.
contract PocketFaucet is Ownable {
    using SafeERC20 for IERC20;

    error NotOperator();
    error AlreadyClaimed();

    event Dripped(address indexed to, uint256 usd, uint256 usdc, uint256 gas);
    event OperatorSet(address indexed operator, bool allowed);
    event AmountsSet(uint256 usd, uint256 usdc, uint256 gas);

    IERC20 public immutable usd;
    IERC20 public immutable usdc;
    uint256 public usdAmount;
    uint256 public usdcAmount;
    uint256 public gasAmount;

    mapping(address => bool) public claimed;
    mapping(address => bool) public operators;

    constructor(IERC20 usd_, IERC20 usdc_, uint256 usdAmount_, uint256 usdcAmount_, uint256 gasAmount_, address owner_)
        Ownable(owner_)
    {
        usd = usd_;
        usdc = usdc_;
        _setAmounts(usdAmount_, usdcAmount_, gasAmount_);
    }

    receive() external payable {}

    /// @notice Each part is skipped rather than reverting when the faucet runs low on it,
    ///         so a newcomer still gets whatever is left.
    function drip(address payable to) external {
        if (!operators[msg.sender]) revert NotOperator();
        if (claimed[to]) revert AlreadyClaimed();
        claimed[to] = true;

        uint256 u = usd.balanceOf(address(this)) >= usdAmount ? usdAmount : 0;
        uint256 c = usdc.balanceOf(address(this)) >= usdcAmount ? usdcAmount : 0;
        uint256 g = address(this).balance >= gasAmount ? gasAmount : 0;
        emit Dripped(to, u, c, g);

        if (u > 0) usd.safeTransfer(to, u);
        if (c > 0) usdc.safeTransfer(to, c);
        if (g > 0) Address.sendValue(to, g);
    }

    function setOperator(address operator, bool allowed) external onlyOwner {
        operators[operator] = allowed;
        emit OperatorSet(operator, allowed);
    }

    function setAmounts(uint256 usdAmount_, uint256 usdcAmount_, uint256 gasAmount_) external onlyOwner {
        _setAmounts(usdAmount_, usdcAmount_, gasAmount_);
    }

    function withdraw(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (address(token) == address(0)) Address.sendValue(payable(to), amount);
        else token.safeTransfer(to, amount);
    }

    function _setAmounts(uint256 usdAmount_, uint256 usdcAmount_, uint256 gasAmount_) internal {
        usdAmount = usdAmount_;
        usdcAmount = usdcAmount_;
        gasAmount = gasAmount_;
        emit AmountsSet(usdAmount_, usdcAmount_, gasAmount_);
    }
}
