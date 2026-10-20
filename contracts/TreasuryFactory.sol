// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Treasury} from "./Treasury.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {ITreasuryFactory} from "./interfaces/ITreasuryFactory.sol";

contract TreasuryFactory is ITreasuryFactory {

    mapping(address => address[]) private _wallets;
    uint256 public immutable deployedAtBlock = block.number;

    function createWallet( ITreasury.Config calldata config
    ) external returns (address wallet) {

        wallet = address(new Treasury(config));
        for (uint256 i; i < config.owners.length; ++i)
            _wallets[config.owners[i]].push(wallet);

        for (uint256 i; i < config.guardians.length; ++i)
            _wallets[config.guardians[i]].push(wallet);

        emit WalletCreated(wallet, msg.sender);
    }

    function walletsOf(address a) external view returns (address[] memory) {
        return _wallets[a];
    }
}
