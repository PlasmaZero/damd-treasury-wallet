// contracts/interfaces/ITreasury.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface ITreasury {
    // ORDER IS FROZEN - the ABI encodes enums as uint8.
    enum ActionType {
        Payment,              // 0
        AddOwner,             // 1
        RemoveOwner,          // 2
        ReplaceOwner,         // 3
        SetThreshold,         // 4
        AddGuardian,          // 5
        RemoveGuardian,       // 6
        SetGuardianThreshold, // 7
        SetLimits,            // 8
        SetDelays             // 9
    }
    // Used for proposals AND recoveries. Expired is never stored; getters derive it.
    enum Status { Pending, Queued, Executed, Cancelled, Expired }

    struct Limits { uint256 perTxCap; uint256 dailyCap; uint256 smallTierCap; } // wei
    struct Delays {                                                              // seconds
        uint64 smallTierDelay; uint64 largeTierDelay; uint64 governanceDelay;
        uint64 recoveryDelay;  uint64 proposalTTL;    uint64 recoveryTTL;
    }
    struct Config {
        address[] owners;    uint256 threshold;
        address[] guardians; uint256 guardianThreshold;
        Limits limits;       Delays delays;
    }
    struct Proposal {
        ActionType action; bytes params; address proposer;
        uint64 createdAt; uint64 readyAt; uint64 expiresAt; Status status;
    }
    struct Recovery {
        address oldOwner; address newOwner; address initiator;
        uint64 createdAt; uint64 readyAt; uint64 expiresAt; Status status;
        bool newOwnerConfirmed;
    }

    // ---- events ----
    event Deposited(address indexed from, uint256 amount);
    event ProposalCreated(uint256 indexed id, ActionType action, address indexed proposer, bytes params);
    event Approved(uint256 indexed id, address indexed owner);
    event ApprovalRevoked(uint256 indexed id, address indexed owner);
    event Queued(uint256 indexed id, uint64 readyAt);
    event CancelVoted(uint256 indexed id, address indexed owner);
    event Cancelled(uint256 indexed id);
    event Executed(uint256 indexed id);
    event PaymentSent(uint256 indexed id, address indexed recipient, uint256 amount);
    event OwnerAdded(address indexed owner);
    event OwnerRemoved(address indexed owner);
    event OwnerReplaced(address indexed oldOwner, address indexed newOwner);
    event ThresholdChanged(uint256 threshold);
    event GuardianAdded(address indexed guardian);
    event GuardianRemoved(address indexed guardian);
    event GuardianThresholdChanged(uint256 guardianThreshold);
    event LimitsChanged(Limits limits);
    event DelaysChanged(Delays delays);
    event RecoveryInitiated(uint256 indexed id, address indexed oldOwner, address indexed newOwner, address initiator);
    event RecoveryApproved(uint256 indexed id, address indexed guardian);
    event RecoveryQueued(uint256 indexed id, uint64 readyAt);
    event RecoveryConfirmed(uint256 indexed id);
    event RecoveryCancelVoted(uint256 indexed id, address indexed owner);
    event RecoveryCancelled(uint256 indexed id, address indexed by);
    event RecoveryExecuted(uint256 indexed id);

    // ---- errors (no arguments; UI maps names via errors.js) ----
    error NotOwner();          error NotGuardian();        error NotAuthorized();
    error InvalidAddress();    error DuplicateAddress();   error RoleOverlap();
    error TooManyMembers();    error InvalidThreshold();   error InvalidLimits();
    error InvalidDelays();     error InvalidAction();      error AmountZero();
    error AboveTxCap();        error DailyCapExceeded();   error InsufficientBalance();
    error UnknownProposal();   error UnknownRecovery();    error AlreadyApproved();
    error NotApproved();       error AlreadyVoted();       error WrongStatus();
    error TimelockActive();    error RequestExpired();     error BelowThreshold();
    error RecoveryAlreadyActive(); error NewOwnerNotConfirmed(); error TransferFailed();
    // Reentrancy surfaces as OpenZeppelin's ReentrancyGuardReentrantCall().

    // ---- deposits ----
    receive() external payable;

    // ---- owner actions ----
    function proposePayment(address payable recipient, uint256 amount) external returns (uint256 id);
    function proposeAction(ActionType action, bytes calldata params) external returns (uint256 id); // not Payment
    function approve(uint256 id) external;
    function revokeApproval(uint256 id) external;
    function voteCancel(uint256 id) external;
    function execute(uint256 id) external;

    // ---- recovery ----
    function initiateRecovery(address oldOwner, address newOwner) external returns (uint256 id); // guardian
    function approveRecovery(uint256 id) external;      // guardian
    function confirmRecovery(uint256 id) external;      // newOwner
    function cancelRecovery(uint256 id) external;       // oldOwner
    function voteCancelRecovery(uint256 id) external;   // owner
    function executeRecovery(uint256 id) external;      // guardian or newOwner

    // ---- views ----
    function getConfig() external view returns (Config memory);
    function isOwner(address account) external view returns (bool);
    function isGuardian(address account) external view returns (bool);
    function cancelThreshold() external view returns (uint256);          // N - M + 1
    function currentDay() external view returns (uint256);               // block.timestamp / 1 days
    function spentToday() external view returns (uint256);
    function remainingToday() external view returns (uint256);           // floor at 0
    function deployedAtBlock() external view returns (uint256);
    function proposalCount() external view returns (uint256);
    function getProposal(uint256 id) external view returns (Proposal memory); // status derived
    function liveApprovals(uint256 id) external view returns (uint256);
    function hasApproved(uint256 id, address owner) external view returns (bool);
    function cancelVotes(uint256 id) external view returns (uint256);         // live
    function hasVotedCancel(uint256 id, address owner) external view returns (bool);
    function recoveryCount() external view returns (uint256);
    function getRecovery(uint256 id) external view returns (Recovery memory); // status derived
    function liveRecoveryApprovals(uint256 id) external view returns (uint256);
    function hasRecoveryApproval(uint256 id, address guardian) external view returns (bool);
    function recoveryCancelVotes(uint256 id) external view returns (uint256); // live, excl. oldOwner
    function hasVotedCancelRecovery(uint256 id, address owner) external view returns (bool);
    function activeRecoveryFor(address owner) external view returns (bool active, uint256 id);
}

