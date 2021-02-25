// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

interface ISenate  {
        
    struct Manager {
        uint256 budget;
        address owner;
    }

    struct Vote {
        uint8 approve;
        bool voted;
        address manager;
    }

    struct Candidate {
        uint8 positiong;
        address owner;
        string hashCodeProposal;
    }
    
    struct ManagementReplacement {
        uint256 position;
        address owner;
    }

    // ** View functions ** //

    function getBudgetAllocation() external view returns(uint256, uint256, uint256, uint256, uint256);
    function getManagersOwner() external view returns(address, address, address, address, address);
    function getProposedBudgetAllocation() external view returns(uint256, uint256, uint256, uint256, uint256);
    

    // ** Public functions ** //

    function initializeFullSenateBan() external;
    function withdrawCoinsFromSenateBan() external;
    function submitSenateBan(uint256 amount) external;
    function initializeVotingCycle() external;
    function submitCandidate(uint8 position, string memory proposal) external;
    function finalizeVotingPeriod() external;
    function withdrawVotedCoins() external;
    function voteCandidate(address _candidate, uint256 amount) external;
    function executeReplacementVote() external;
    function withdrawTokensForReplacementVote() external;
    function submitApprovalForVoteReplacement(uint256 amount) external;
    
    // ** Single Manager functions ** //
    
    function claimBudget() external;
    
    // ** Multi-manager functions ** //
    
    function initialize() external;
    function voteNewBudgetAllocation(uint8 approve) external;
    function proposeNewBudgetAllocation(uint256[] memory new_budget_allocation) external;
    function voteManagementReplacement(uint8 approve) external;
    function proposeManagementReplace(uint8 _position, address _newManager) external;
    
}
