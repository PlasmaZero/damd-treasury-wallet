// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Milestone 2 teaching prototype. Local test funds only.
/// Social recovery and owner-set changes are design-only in this version.
contract Treasury {
    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public immutable threshold;
    uint256 public immutable spendingLimit;
    uint256 public immutable delaySeconds;
    struct Payment {
        address payable recipient;
        uint256 amount;
        uint256 approvals;
        uint256 readyAt;
        bool executed;
    }
    Payment[] public payments;
    mapping(uint256 => mapping(address => bool)) public approved;
    bool private entered;

    event Deposited(address indexed sender, uint256 amount);
    event PaymentProposed(uint256 indexed id, address indexed proposer, address recipient, uint256 amount);
    event PaymentApproved(uint256 indexed id, address indexed owner, uint256 approvals);
    event PaymentQueued(uint256 indexed id, uint256 readyAt);
    event PaymentExecuted(uint256 indexed id, address recipient, uint256 amount);

    modifier onlyOwner() { require(isOwner[msg.sender], "Owner only"); _; }
    modifier nonReentrant() { require(!entered, "Reentrant call"); entered = true; _; entered = false; }

    constructor(address[] memory initialOwners, uint256 requiredApprovals, uint256 limit, uint256 delay) {
        require(initialOwners.length >= 2 && initialOwners.length <= 20, "Owner count 2-20");
        require(requiredApprovals >= 2 && requiredApprovals <= initialOwners.length, "Invalid threshold");
        require(limit > 0 && delay > 0, "Invalid policy");
        for (uint256 i; i < initialOwners.length; ++i) {
            address owner = initialOwners[i];
            require(owner != address(0) && !isOwner[owner], "Invalid owner");
            isOwner[owner] = true;
            owners.push(owner);
        }
        threshold = requiredApprovals;
        spendingLimit = limit;
        delaySeconds = delay;
    }
    receive() external payable { emit Deposited(msg.sender, msg.value); }
    function ownerCount() external view returns (uint256) { return owners.length; }
    function paymentCount() external view returns (uint256) { return payments.length; }
    function propose(address payable recipient, uint256 amount) external onlyOwner returns (uint256 id) {
        require(recipient != address(0) && recipient != address(this), "Invalid recipient");
        require(amount > 0 && amount <= spendingLimit, "Above limit or zero");
        id = payments.length;
        payments.push(Payment(recipient, amount, 0, 0, false));
        emit PaymentProposed(id, msg.sender, recipient, amount);
    }
    function approve(uint256 id) external onlyOwner {
        require(id < payments.length, "Unknown payment");
        Payment storage p = payments[id];
        require(!p.executed && !approved[id][msg.sender], "Final or already approved");
        approved[id][msg.sender] = true;
        ++p.approvals;
        emit PaymentApproved(id, msg.sender, p.approvals);
        if (p.approvals == threshold) {
            p.readyAt = block.timestamp + delaySeconds;
            emit PaymentQueued(id, p.readyAt);
        }
    }
    function execute(uint256 id) external onlyOwner nonReentrant {
        require(id < payments.length, "Unknown payment");
        Payment storage p = payments[id];
        require(!p.executed, "Already executed");
        require(p.approvals >= threshold, "More approvals needed");
        require(block.timestamp >= p.readyAt, "Timelock active");
        require(p.amount <= spendingLimit, "Above spending limit");
        require(address(this).balance >= p.amount, "Insufficient treasury balance");
        p.executed = true;
        (bool ok,) = p.recipient.call{value: p.amount}("");
        require(ok, "Transfer failed");
        emit PaymentExecuted(id, p.recipient, p.amount);
    }
}
