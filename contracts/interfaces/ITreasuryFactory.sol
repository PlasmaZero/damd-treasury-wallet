// contracts/interfaces/ITreasuryFactory.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {ITreasury} from "./ITreasury.sol";

interface ITreasuryFactory {
    event WalletCreated(address indexed wallet, address indexed creator);
    function createWallet(ITreasury.Config calldata config) external returns (address wallet);
    function walletsOf(address account) external view returns (address[] memory); // owners+guardians at creation
    function deployedAtBlock() external view returns (uint256);
}

