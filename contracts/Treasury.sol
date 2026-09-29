// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Milestone 2: receive local test ETH and read the balance.
// Payments and social recovery will be added in later milestones.
contract Treasury {
    event Deposited(address indexed sender, uint256 amount);

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
