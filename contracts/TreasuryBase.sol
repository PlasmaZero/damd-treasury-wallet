// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {ITreasury} from "./interfaces/ITreasury.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

abstract contract TreasuryBase is ITreasury, ReentrancyGuard {

    address[] internal _owners;
    address[] internal _guardians;
    mapping(address => bool) public isOwner;
    mapping(address => bool) public isGuardian;
    // Membership generations stop old votes reviving if an address leaves and rejoins.
    mapping(address => uint256) internal _generation;
    uint256 public threshold;
    uint256 public guardianThreshold;
    Limits internal _limits;
    Delays internal _delays;
    mapping(uint256 => uint256) internal _spentPerDay;
    uint256 public immutable deployedAtBlock;

    //++++++ Constructor ++++++
    constructor(Config memory c) {

        deployedAtBlock = block.number;

        for (uint256 i; i < c.owners.length; ++i) _addOwner(c.owners[i]);
        for (uint256 i; i < c.guardians.length; ++i) _addGuardian(c.guardians[i]);

        _setThreshold(c.threshold); // threshold of owners to approve a proposal
        _setGuardianThreshold(c.guardianThreshold); // threshold of guardians to approve a recovery
        _setLimits(c.limits); // limits for spending
        _setDelays(c.delays); // delays for operations
    }

    //++++++ Mdodifiers -- Repeated coded that can be used anywhere ++++++
    modifier onlyOwner() {
        if (!isOwner[msg.sender]) revert NotOwner();
        _; // placeholder for the function body that uses this modifier
    }
    modifier onlyGuardian() {
        if (!isGuardian[msg.sender]) revert NotGuardian();
        _;
    }


    // Special function to receive ETH. Emits Deposited.
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function getConfig() external view returns (Config memory) {
        return
            Config(
                _owners,
                threshold,
                _guardians,
                guardianThreshold,
                _limits,
                _delays
            );
    }

    function cancelThreshold() public view returns (uint256) {
        return _owners.length - threshold + 1;
    }

    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // ++++ START External Functions called to get general information ++++
    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

    function currentDay() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function spentToday() public view returns (uint256) {
        return _spentPerDay[currentDay()];
    }

    function remainingToday() external view returns (uint256) {
        uint256 s = spentToday();
        return s >= _limits.dailyCap ? 0 : _limits.dailyCap - s;
    }

    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // ++++ END External Functions called to get general information ++++
    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // ++++ START Internal Functions called by instance ++++
    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

    function _addOwner(address a) internal {

        _checkOwner(a);

        if (_owners.length >= 20) revert TooManyMembers(); // limit of 20 owners or guardians

        isOwner[a] = true;
        ++_generation[a];
        _owners.push(a);
        emit OwnerAdded(a);
    }

    function _removeOwner(address a) internal {
        if (!isOwner[a]) revert NotOwner();
        if (_owners.length - 1 < threshold) revert InvalidThreshold();

        isOwner[a] = false;
        _remove(_owners, a);
        emit OwnerRemoved(a);
    }

    function _replaceOwner(address oldA, address newA) internal {
        if (!isOwner[oldA]) revert NotOwner();
        _checkOwner(newA);

        for (uint256 i; i < _owners.length; ++i)
            if (_owners[i] == oldA) {
                _owners[i] = newA;
                break;
            }
        isOwner[oldA] = false;
        isOwner[newA] = true;
        ++_generation[newA];

        emit OwnerReplaced(oldA, newA);
    }

    function _addGuardian(address g) internal {

        _checkGuardian(g);

        if (_guardians.length >= 20) revert TooManyMembers(); // limit of 20 owners or guardians
        isGuardian[g] = true;
        ++_generation[g];
        _guardians.push(g);

        emit GuardianAdded(g);
    }

    function _removeGuardian(address g) internal {
        if (!isGuardian[g]) revert NotGuardian();
        if (_guardians.length - 1 < guardianThreshold)
            revert InvalidThreshold();

        isGuardian[g] = false;
        _remove(_guardians, g);
        emit GuardianRemoved(g);
    }

    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // ++++ END Internal Functions called by instance ++++
    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


    function _now() internal view returns (uint64) {
        return uint64(block.timestamp);
    }

    function _validateNewMember(address a) internal view {
        if (a == address(0) || a == address(this)) revert InvalidAddress();
        if (isOwner[a] || isGuardian[a]) revert DuplicateAddress();
    }

    function _checkOwner(address a) internal view {
        if (isGuardian[a]) revert RoleOverlap();
        _validateNewMember(a);
    }

    function _checkGuardian(address a) internal view {
        if (isOwner[a]) revert RoleOverlap();
        _validateNewMember(a);
    }

    function _remove(address[] storage members, address a) private {
        for (uint256 i; i < members.length; ++i)
            if (members[i] == a) {
                for (uint256 j = i; j + 1 < members.length; ++j)
                    members[j] = members[j + 1];
                members.pop();
                break;
            }
    }

    function _setThreshold(uint256 m) internal {
        if (m == 0 || m > _owners.length) revert InvalidThreshold();
        threshold = m;
        emit ThresholdChanged(m);
    }

    function _setGuardianThreshold(uint256 k) internal {
        if (k == 0 || k > _guardians.length) revert InvalidThreshold();
        guardianThreshold = k;
        emit GuardianThresholdChanged(k);
    }

    function _validateLimits(Limits memory l) internal pure {
        if (
            l.smallTierCap == 0 ||
            l.smallTierCap > l.perTxCap ||
            l.perTxCap > l.dailyCap
        ) revert InvalidLimits();
    }

    function _validateDelays(Delays memory d) internal pure {
        if (
            d.governanceDelay < 60 ||
            d.recoveryDelay < 60 ||
            d.smallTierDelay > d.largeTierDelay ||
            d.largeTierDelay > d.governanceDelay ||
            d.governanceDelay > d.recoveryDelay ||
            d.proposalTTL <= d.governanceDelay ||
            d.recoveryTTL <= d.recoveryDelay
        ) revert InvalidDelays();
    }

    function _setLimits(Limits memory l) internal {
        _validateLimits(l);
        _limits = l;
        emit LimitsChanged(l);
    }

    function _setDelays(Delays memory d) internal {
        _validateDelays(d);
        _delays = d;
        emit DelaysChanged(d);
    }

    function _countOwnerVotes( mapping(address => bool) storage votes
    ) internal view returns (uint256 n) {
        for (uint256 i; i < _owners.length; ++i) if (votes[_owners[i]]) ++n;
    }

    function _countOwnerVotesExcluding( mapping(address => bool) storage votes, address excluded
    ) internal view returns (uint256 n) {
        for (uint256 i; i < _owners.length; ++i)
            if (_owners[i] != excluded && votes[_owners[i]]) ++n;
    }

    function _countGuardianVotes( mapping(address => bool) storage votes
    ) internal view returns (uint256 n) {
        for (uint256 i; i < _guardians.length; ++i)
            if (votes[_guardians[i]]) ++n;
    }

    function _derived(Status s, uint64 expiry) internal view returns (Status) {

        /**
         * Returns the derived status of a proposal or recovery, given its stored
         * status and expiry time. Expired is never stored; it is derived.
         */

        return
            (s == Status.Pending || s == Status.Queued) &&
                block.timestamp > expiry
                ? Status.Expired
                : s;
    }
}
