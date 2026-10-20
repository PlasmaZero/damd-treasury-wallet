// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {TreasuryBase} from "./TreasuryBase.sol";
abstract contract TreasuryRecovery is TreasuryBase {
    Recovery[] private _recoveries;

    mapping(uint256 => mapping(address => uint256)) private _recoveryApprovals;
    mapping(uint256 => mapping(address => uint256)) private _recoveryCancels;
    mapping(address => uint256) private _activeOld; // id+1; zero means none
    mapping(address => uint256) private _activeNew;
    mapping(uint256 => uint256) private _oldGeneration;

    function recoveryCount() external view returns (uint256) {
        return _recoveries.length;
    }

    function _recovery(uint256 id) private view returns (Recovery storage r) {
        if (id >= _recoveries.length) revert UnknownRecovery();
        return _recoveries[id];
    }

    function getRecovery(uint256 id) external view returns (Recovery memory r) {
        r = _recovery(id);
        r.status = _derived(r.status, r.expiresAt);
    }

    function _isActive(uint256 index) private view returns (bool) {
        if (index == 0) return false;
        Recovery storage r = _recoveries[index - 1];
        Status s = _derived(r.status, r.expiresAt);
        return s == Status.Pending || s == Status.Queued;
    }

    function activeRecoveryFor(
        address a
    ) external view returns (bool active, uint256 id) {
        uint256 x = _activeOld[a];
        return (_isActive(x), x == 0 ? 0 : x - 1);
    }

    function _requireActive(Recovery storage r) private view {
        if (_derived(r.status, r.expiresAt) == Status.Expired)
            revert RequestExpired();
        if (r.status != Status.Pending && r.status != Status.Queued)
            revert WrongStatus();
    }

    function hasRecoveryApproval(
        uint256 id,
        address a
    ) public view returns (bool) {
        _recovery(id);
        return
            isGuardian[a] &&
            _recoveryApprovals[id][a] != 0 &&
            _recoveryApprovals[id][a] == _generation[a];
    }

    function hasVotedCancelRecovery(
        uint256 id,
        address a
    ) public view returns (bool) {
        Recovery storage r = _recovery(id);
        return
            a != r.oldOwner &&
            isOwner[a] &&
            _recoveryCancels[id][a] != 0 &&
            _recoveryCancels[id][a] == _generation[a];
    }

    function liveRecoveryApprovals(uint256 id) public view returns (uint256 n) {
        _recovery(id);
        for (uint256 i; i < _guardians.length; ++i)
            if (hasRecoveryApproval(id, _guardians[i])) ++n;
    }
    
    function recoveryCancelVotes(uint256 id) public view returns (uint256 n) {
        _recovery(id);
        for (uint256 i; i < _owners.length; ++i)
            if (hasVotedCancelRecovery(id, _owners[i])) ++n;
    }

    function initiateRecovery(
        address oldOwner,
        address newOwner
    ) external onlyGuardian nonReentrant returns (uint256 id) {
        if (!isOwner[oldOwner]) revert NotOwner();
        _validateNewMember(newOwner);
        if (_isActive(_activeOld[oldOwner]) || _isActive(_activeNew[newOwner]))
            revert RecoveryAlreadyActive();
        id = _recoveries.length;
        _recoveries.push(
            Recovery(
                oldOwner,
                newOwner,
                msg.sender,
                _now(),
                0,
                _now() + _delays.recoveryTTL,
                Status.Pending,
                false
            )
        );
        _activeOld[oldOwner] = id + 1;
        _activeNew[newOwner] = id + 1;
        _oldGeneration[id] = _generation[oldOwner];
        emit RecoveryInitiated(id, oldOwner, newOwner, msg.sender);
        _recoveryApprovals[id][msg.sender] = _generation[msg.sender];
        emit RecoveryApproved(id, msg.sender);
        _queueRecovery(id);
    }

    function _queueRecovery(uint256 id) private {
        Recovery storage r = _recoveries[id];
        if (
            r.status == Status.Pending &&
            liveRecoveryApprovals(id) >= guardianThreshold
        ) {
            r.status = Status.Queued;
            r.readyAt = _now() + _delays.recoveryDelay;
            emit RecoveryQueued(id, r.readyAt);
        }
    }

    function approveRecovery(uint256 id) external onlyGuardian nonReentrant {
        Recovery storage r = _recovery(id);
        _requireActive(r);
        if (hasRecoveryApproval(id, msg.sender)) revert AlreadyApproved();
        _recoveryApprovals[id][msg.sender] = _generation[msg.sender];
        emit RecoveryApproved(id, msg.sender);
        _queueRecovery(id);
    }

    function confirmRecovery(uint256 id) external nonReentrant {
        Recovery storage r = _recovery(id);
        if (msg.sender != r.newOwner) revert NotAuthorized();
        _requireActive(r);
        if (r.newOwnerConfirmed) revert AlreadyApproved();
        r.newOwnerConfirmed = true;
        emit RecoveryConfirmed(id);
    }

    function cancelRecovery(uint256 id) external nonReentrant {
        Recovery storage r = _recovery(id);
        if (msg.sender != r.oldOwner) revert NotAuthorized();
        _requireActive(r);
        _cancel(id);
    }

    function voteCancelRecovery(uint256 id) external onlyOwner nonReentrant {
        Recovery storage r = _recovery(id);
        _requireActive(r);
        if (msg.sender == r.oldOwner) revert NotAuthorized();
        if (hasVotedCancelRecovery(id, msg.sender)) revert AlreadyVoted();
        _recoveryCancels[id][msg.sender] = _generation[msg.sender];
        emit RecoveryCancelVoted(id, msg.sender);
        if (recoveryCancelVotes(id) >= threshold) _cancel(id);
    }

    function _clear(uint256 id) private {
        Recovery storage r = _recoveries[id];
        if (_activeOld[r.oldOwner] == id + 1) delete _activeOld[r.oldOwner];
        if (_activeNew[r.newOwner] == id + 1) delete _activeNew[r.newOwner];
    }

    function _cancel(uint256 id) private {
        _recoveries[id].status = Status.Cancelled;
        _clear(id);
        emit RecoveryCancelled(id, msg.sender);
    }

    function executeRecovery(uint256 id) external nonReentrant {
        Recovery storage r = _recovery(id);
        if (!isGuardian[msg.sender] && msg.sender != r.newOwner)
            revert NotAuthorized();
        _requireActive(r);
        if (r.status != Status.Queued) revert WrongStatus();
        if (block.timestamp < r.readyAt) revert TimelockActive();
        if (liveRecoveryApprovals(id) < guardianThreshold)
            revert BelowThreshold();
        if (!r.newOwnerConfirmed) revert NewOwnerNotConfirmed();
        if (
            !isOwner[r.oldOwner] ||
            _generation[r.oldOwner] != _oldGeneration[id]
        ) revert NotOwner();
        _validateNewMember(r.newOwner);
        r.status = Status.Executed;
        _clear(id);
        _replaceOwner(r.oldOwner, r.newOwner);
        emit RecoveryExecuted(id);
    }
    
}
