// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {TreasuryBase} from "./TreasuryBase.sol";
abstract contract TreasuryProposals is TreasuryBase {
    Proposal[] internal _proposals;
    mapping(uint256=>mapping(address=>uint256)) private _approvals;
    mapping(uint256=>mapping(address=>uint256)) private _cancellations;
    function proposalCount() external view returns(uint256) { return _proposals.length; }
    function _proposal(uint256 id) internal view returns(Proposal storage p) { if(id>=_proposals.length) revert UnknownProposal(); return _proposals[id]; }
    function getProposal(uint256 id) external view returns(Proposal memory p) { p=_proposal(id); p.status=_derived(p.status,p.expiresAt); }
    function hasApproved(uint256 id,address a) public view returns(bool) { _proposal(id); return isOwner[a] && _approvals[id][a]!=0 && _approvals[id][a]==_generation[a]; }
    function hasVotedCancel(uint256 id,address a) public view returns(bool) { _proposal(id); return isOwner[a] && _cancellations[id][a]!=0 && _cancellations[id][a]==_generation[a]; }
    function liveApprovals(uint256 id) public view returns(uint256 n) { _proposal(id); for(uint256 i;i<_owners.length;++i) if(hasApproved(id,_owners[i])) ++n; }
    function cancelVotes(uint256 id) public view returns(uint256 n) { _proposal(id); for(uint256 i;i<_owners.length;++i) if(hasVotedCancel(id,_owners[i])) ++n; }
    function _active(Proposal storage p) internal view {
        if(_derived(p.status,p.expiresAt)==Status.Expired) revert RequestExpired();
        if(p.status!=Status.Pending && p.status!=Status.Queued) revert WrongStatus();
    }
    function _validatePayment(address recipient,uint256 amount) internal view {
        if(recipient==address(0) || recipient==address(this)) revert InvalidAddress();
        if(amount==0) revert AmountZero(); if(amount>_limits.perTxCap) revert AboveTxCap();
    }
    function proposePayment(address payable recipient,uint256 amount) external onlyOwner nonReentrant returns(uint256 id) {
        _validatePayment(recipient,amount); return _create(ActionType.Payment,abi.encode(recipient,amount));
    }
    function proposeAction(ActionType action,bytes calldata params) external onlyOwner nonReentrant returns(uint256 id) {
        if(action==ActionType.Payment) revert InvalidAction(); _validateAction(action,params); return _create(action,params);
    }
    function _create(ActionType action,bytes memory params) private returns(uint256 id) {
        id=_proposals.length;
        _proposals.push(Proposal(action,params,msg.sender,_now(),0,_now()+_delays.proposalTTL,Status.Pending));
        emit ProposalCreated(id,action,msg.sender,params);
        _approvals[id][msg.sender]=_generation[msg.sender]; emit Approved(id,msg.sender); _queue(id);
    }
    function _queue(uint256 id) private {
        Proposal storage p=_proposals[id];
        if(p.status!=Status.Pending || liveApprovals(id)<threshold) return;
        uint64 delay=_delays.governanceDelay;
        if(p.action==ActionType.Payment) {
            (,uint256 amount)=abi.decode(p.params,(address,uint256));
            delay=amount<=_limits.smallTierCap ? _delays.smallTierDelay : _delays.largeTierDelay;
        }
        p.status=Status.Queued; p.readyAt=_now()+delay; emit Queued(id,p.readyAt);
    }
    function approve(uint256 id) external onlyOwner nonReentrant {
        Proposal storage p=_proposal(id); _active(p);
        if(hasApproved(id,msg.sender)) revert AlreadyApproved();
        _approvals[id][msg.sender]=_generation[msg.sender]; emit Approved(id,msg.sender); _queue(id);
    }
    function revokeApproval(uint256 id) external onlyOwner nonReentrant {
        Proposal storage p=_proposal(id); _active(p); if(p.status!=Status.Pending) revert WrongStatus();
        if(!hasApproved(id,msg.sender)) revert NotApproved(); delete _approvals[id][msg.sender]; emit ApprovalRevoked(id,msg.sender);
    }
    function voteCancel(uint256 id) external onlyOwner nonReentrant {
        Proposal storage p=_proposal(id); _active(p); if(hasVotedCancel(id,msg.sender)) revert AlreadyVoted();
        _cancellations[id][msg.sender]=_generation[msg.sender]; emit CancelVoted(id,msg.sender);
        if(cancelVotes(id)>=cancelThreshold()) { p.status=Status.Cancelled; emit Cancelled(id); }
    }
    function execute(uint256 id) external onlyOwner nonReentrant {
        Proposal storage p=_proposal(id); _active(p);
        if(p.status!=Status.Queued) revert WrongStatus(); if(block.timestamp<p.readyAt) revert TimelockActive();
        if(liveApprovals(id)<threshold) revert BelowThreshold();
        // Effects precede the external transfer; any failure rolls back all effects.
        p.status=Status.Executed;
        if(p.action==ActionType.Payment) {
            (address recipient,uint256 amount)=abi.decode(p.params,(address,uint256));
            _validatePayment(recipient,amount);
            if(spentToday()+amount>_limits.dailyCap) revert DailyCapExceeded();
            if(address(this).balance<amount) revert InsufficientBalance();
            _spentPerDay[currentDay()]+=amount;
            (bool ok,)=payable(recipient).call{value:amount}(""); if(!ok) revert TransferFailed();
            emit PaymentSent(id,recipient,amount);
        } else { _validateAction(p.action,p.params); _applyAction(p.action,p.params); }
        emit Executed(id);
    }
    function _validateAction(ActionType,bytes memory) internal view virtual { revert InvalidAction(); }
    function _applyAction(ActionType,bytes memory) internal virtual { revert InvalidAction(); }
}
