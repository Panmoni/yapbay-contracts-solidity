// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

contract ERC20Mock is ERC20Upgradeable {
    function initialize(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) public initializer {
        __ERC20_init(name, symbol);
        _mint(msg.sender, initialSupply);
    }

    // Optional: Add mint function for testing
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
