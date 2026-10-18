// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {TreasuryBase} from "./TreasuryBase.sol";
import {TreasuryGovernance} from "./TreasuryGovernance.sol";
import {TreasuryRecovery} from "./TreasuryRecovery.sol";
contract Treasury is TreasuryGovernance, TreasuryRecovery {
    constructor(Config memory c) TreasuryBase(c) {}
}
