// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {TreasuryProposals} from "./TreasuryProposals.sol";

abstract contract TreasuryGovernance is TreasuryProposals {

    // Only static tuples are accepted. Check length and address/uint64 padding before decode.
    function _validateEncoding(ActionType a,bytes memory p) private pure {
        uint256 words=a==ActionType.ReplaceOwner ? 2 : a==ActionType.SetLimits ? 3 : a==ActionType.SetDelays ? 6 : 1;
        if(p.length!=words*32 || a==ActionType.Payment) revert InvalidAction();
        if(a==ActionType.AddOwner || a==ActionType.RemoveOwner || a==ActionType.ReplaceOwner || a==ActionType.AddGuardian || a==ActionType.RemoveGuardian) {
            for(uint256 i;i<words;++i) { uint256 v; assembly { v := mload(add(add(p,32),mul(i,32))) } if(v>type(uint160).max) revert InvalidAction(); }
        }
        if(a==ActionType.SetDelays) for(uint256 i;i<6;++i) { uint256 v; assembly { v := mload(add(add(p,32),mul(i,32))) } if(v>type(uint64).max) revert InvalidAction(); }
    }
    
    function _validateAction(ActionType a,bytes memory p) internal view override {
        _validateEncoding(a,p);
        if(a==ActionType.AddOwner) { _checkOwner(abi.decode(p,(address))); if(_owners.length>=20) revert TooManyMembers(); }
        else if(a==ActionType.RemoveOwner) { if(!isOwner[abi.decode(p,(address))]) revert NotOwner(); if(_owners.length-1<threshold) revert InvalidThreshold(); }
        else if(a==ActionType.ReplaceOwner) { (address oldA,address newA)=abi.decode(p,(address,address)); if(!isOwner[oldA]) revert NotOwner(); _checkOwner(newA); }
        else if(a==ActionType.SetThreshold) { uint256 m=abi.decode(p,(uint256)); if(m==0 || m>_owners.length) revert InvalidThreshold(); }
        else if(a==ActionType.AddGuardian) { _checkGuardian(abi.decode(p,(address))); if(_guardians.length>=20) revert TooManyMembers(); }
        else if(a==ActionType.RemoveGuardian) { if(!isGuardian[abi.decode(p,(address))]) revert NotGuardian(); if(_guardians.length-1<guardianThreshold) revert InvalidThreshold(); }
        else if(a==ActionType.SetGuardianThreshold) { uint256 k=abi.decode(p,(uint256)); if(k==0 || k>_guardians.length) revert InvalidThreshold(); }
        else if(a==ActionType.SetLimits) _validateLimits(abi.decode(p,(Limits)));
        else if(a==ActionType.SetDelays) _validateDelays(abi.decode(p,(Delays)));
        else revert InvalidAction();
    }
    function _applyAction(ActionType a,bytes memory p) internal override {
        if(a==ActionType.AddOwner) _addOwner(abi.decode(p,(address)));
        else if(a==ActionType.RemoveOwner) _removeOwner(abi.decode(p,(address)));
        else if(a==ActionType.ReplaceOwner) { (address oldA,address newA)=abi.decode(p,(address,address)); _replaceOwner(oldA,newA); }
        else if(a==ActionType.SetThreshold) _setThreshold(abi.decode(p,(uint256)));
        else if(a==ActionType.AddGuardian) _addGuardian(abi.decode(p,(address)));
        else if(a==ActionType.RemoveGuardian) _removeGuardian(abi.decode(p,(address)));
        else if(a==ActionType.SetGuardianThreshold) _setGuardianThreshold(abi.decode(p,(uint256)));
        else if(a==ActionType.SetLimits) _setLimits(abi.decode(p,(Limits)));
        else if(a==ActionType.SetDelays) _setDelays(abi.decode(p,(Delays)));
        else revert InvalidAction();
    }
}
