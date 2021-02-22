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
    
    
    // ** View functions ** //

    function getBudgetAllocation() external view returns(uint256, uint256, uint256, uint256, uint256);
    function getManagersOwner() external view returns(address, address, address, address, address);
    
    // ** Single Manager functions ** //
    
    function claimBudget() external;
    
    // ** Multi-votes functions ** //
    
    struct ManagementReplacement {
        uint256 position;
        address owner;
    }

    function initialize() external;
    function voteNewBudgetAllocation(uint8 approve) external;
    function proposeNewBudgetAllocation(uint256[] memory new_budget_allocation) external;
    function voteManagementReplacement(uint8 approve) external;
    function proposeManagementReplace(uint8 _position, address _newManager) external;
    
}
