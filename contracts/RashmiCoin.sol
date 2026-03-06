// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract RashmiCoin is ERC20, ERC20Burnable, Ownable {
    uint256 public constant MAX_SUPPLY = 10_000_000 * 10 ** 18;

    constructor(address initialOwner) ERC20("RashmiCoin", "RSC") Ownable(initialOwner) {
        _mint(initialOwner, MAX_SUPPLY);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "RSC: cap exceeded");
        _mint(to, amount);
    }
}
