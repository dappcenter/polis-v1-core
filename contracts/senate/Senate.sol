// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract Senate  {
    
    using SafeMath for uint256;
    
    struct Manager {
        uint256 budget;
        address owner;
    }
    
    Manager tech;
    uint8 TECH_INDEX = 0;
    Manager community;
    uint8 COMMUNITY_INDEX = 1;
    Manager business;
    uint8 BUSINESS_INDEX = 2;
    Manager marketing;
    uint8 MARKETING_INDEX = 3;
    Manager adoption;
    uint8 ADOPTION_INDEX = 4;

    // Common struct for a vote, if a manager approve = 1, reject =0
    struct Vote {
        uint8 approve;
        bool voted;
        address manager;
    }
    
    IERC20 public token;
    
    bool public voting;
    bool public initialized;
    
    constructor(address _tech, address _community, address _business, address _marketing, address _adoption, address _token) {
        token = IERC20(_token);
        
        tech = Manager(30, _tech);
        community = Manager(10, _community);
        business = Manager(20, _business);
        marketing = Manager(20, _marketing);
        adoption = Manager(20, _adoption);

        voting = false;
        initialized = false;
    }
    
    // ** View functions ** //

    function getBudgetAllocation() public view returns(uint256, uint256, uint256, uint256, uint256) {
        return (tech.budget, community.budget, business.budget, marketing.budget, adoption.budget);
    }
    
    function getManagersOwner() public view returns(address, address, address, address, address) {
        return (tech.owner, community.owner, business.owner, marketing.owner, adoption.owner);
    }
    
    // ** Single Manager functions ** //
    
    function claimBudget() public onlyManager {
        require(initialized, "Senate: contract is not initialized yet");
        Manager memory manager = getManager();
        require(manager.owner != address(0), "Senate: no address manager");
        uint256 budgetBalance = token.balanceOf(address(this));
        uint256 managerBudget = budgetBalance.mul(manager.budget.div(100));
        token.transfer(manager.owner, managerBudget);
    }
    
    
    // ** Modifiers ** //
    
    modifier onlyManager() {
        require(isManager(), "Senate: sender is not a manager");
        _;
    }
    
    function isManager() public view returns (bool) {
        address sender = msg.sender;
        if (sender == tech.owner || sender == community.owner || sender == business.owner || sender == marketing.owner || sender == adoption.owner) {
            return true;
        }
        return false;
    }
    
    function getManager() internal onlyManager view returns (Manager memory) {
        address sender = msg.sender;
        if (sender == tech.owner) {
            return tech;
        } else if (sender == community.owner) {
            return community;
        } else if (sender == business.owner) {
            return business;
        } else if (sender == marketing.owner) {
            return marketing;
        } else if (sender == adoption.owner) {
            return adoption;
        }
        return Manager(0, address(0));
    }
    
    function getManagerFromIndex(uint256 index) internal onlyManager view returns (Manager memory) {
        if (index == TECH_INDEX) {
            return tech;
        } else if (index == COMMUNITY_INDEX) {
            return community;
        } else if (index == BUSINESS_INDEX) {
            return business;
        } else if (index == MARKETING_INDEX) {
            return marketing;
        } else if (index == ADOPTION_INDEX) {
            return adoption;
        }
        return Manager(0, address(0));
    }
    
    
    // ** Multi-votes functions ** //
    
    mapping(address => bool) initialization_votes;
    address[]  initialization_votes_arr;
    
    function initialize() public onlyManager {
        Manager memory manager = getManager();
        require(manager.owner != address(0), "Senate: no address manager");
        require(!initialization_votes[manager.owner], "Senate: manager already voted");
        initialization_votes[manager.owner] = true;
        initialization_votes_arr.push(manager.owner);
        if (initialization_votes_arr.length == 5) {
            initialized = true;
        }
    }

    
    uint256[] new_proposed_budget_allocation;
    mapping(address => Vote) approve_new_proposed_budget_allocation;
    Vote[] approve_new_proposed_budget_allocation_arr;
    
    
    function voteNewBudgetAllocation(uint8 approve) public onlyManager {
        Manager memory manager = getManager();
        require(manager.owner != address(0), "Senate: no address manager");
        require(!approve_new_proposed_budget_allocation[manager.owner].voted, "Senate: manager already voted");
        Vote memory vote = Vote(approve, true, msg.sender);
        approve_new_proposed_budget_allocation[manager.owner] = vote;
        approve_new_proposed_budget_allocation_arr.push(vote);
        _changeBudgetAllocation();
    }
    
    function _changeBudgetAllocation() internal {
        if (approve_new_proposed_budget_allocation_arr.length == 5) {
            
            // Check for the managers votes if at least 3 out of 5 vote for the new budget, transition it.
            uint256 approvals = 0;
            for (uint256 i = 0; i < approve_new_proposed_budget_allocation_arr.length; i++) {
                
                if (approve_new_proposed_budget_allocation_arr[i].approve == 1) {
                    approvals++;
                }
                
                // Once the vote is counted, reset the votes mapping
                approve_new_proposed_budget_allocation[approve_new_proposed_budget_allocation_arr[i].manager].voted = false;
                approve_new_proposed_budget_allocation[approve_new_proposed_budget_allocation_arr[i].manager].approve = 0;
                approve_new_proposed_budget_allocation[approve_new_proposed_budget_allocation_arr[i].manager].manager = address(0);

            }
            
            if (approvals >= 3) {
                tech.budget = new_proposed_budget_allocation[TECH_INDEX];
                community.budget = new_proposed_budget_allocation[COMMUNITY_INDEX];
                business.budget = new_proposed_budget_allocation[BUSINESS_INDEX];
                marketing.budget = new_proposed_budget_allocation[MARKETING_INDEX];
                adoption.budget = new_proposed_budget_allocation[ADOPTION_INDEX];
            }
            
            delete approve_new_proposed_budget_allocation_arr;
            delete new_proposed_budget_allocation;
        } 
    }
    
    function proposeNewBudgetAllocation(uint256[] memory new_budget_allocation) public onlyManager {
        require(approve_new_proposed_budget_allocation_arr.length == 0, "Senate: cannot propose a new budget allocation during a voting of a new allocation");
        new_proposed_budget_allocation = new_budget_allocation;
    }

    struct ManagementReplacement {
        uint256 position;
        address owner;
    }

    mapping (address => Vote) manager_replacement_votes;
    Vote[] manager_replacement_votes_arr;
    ManagementReplacement proposed_manager_replacement;
    
    function voteManagementReplacement(uint8 approve) public onlyManager {
        Manager memory manager = getManager();
        require(manager.owner != address(0), "Senate: no address manager");
        require(!manager_replacement_votes[msg.sender].voted, "Senate: manager already voted");
        Vote memory vote = Vote(approve, true, msg.sender);
        manager_replacement_votes[msg.sender] = vote;
        manager_replacement_votes_arr.push(vote);
        _replaceManager();
    }
    
    function _replaceManager() internal onlyManager {
        if (manager_replacement_votes_arr.length == 5) {
            uint256 approvals = 0;

            for (uint256 i = 0; i < manager_replacement_votes_arr.length; i++) {
                
                if (manager_replacement_votes_arr[i].approve == 1) {
                    approvals++;
                }
                
                // Once the vote is counted, reset the votes mapping
                manager_replacement_votes[manager_replacement_votes_arr[i].manager].voted = false;
                manager_replacement_votes[manager_replacement_votes_arr[i].manager].approve = 0;
                manager_replacement_votes[manager_replacement_votes_arr[i].manager].manager = address(0);

            }
            
            if (approvals == 5) {
               Manager memory replacedManager = getManagerFromIndex(proposed_manager_replacement.position);
               replacedManager.owner = proposed_manager_replacement.owner;
            }
            
            delete manager_replacement_votes_arr;
            proposed_manager_replacement.position = 0;
            proposed_manager_replacement.owner = address(0);
        }
    }

    function proposeManagementReplace(uint8 _position, address _newManager) public onlyManager {
        require(manager_replacement_votes_arr.length == 0, "Senate: cannot propose a manager replacement with an ongoin management replacement");
        proposed_manager_replacement.position = _position;
        proposed_manager_replacement.owner = _newManager;
    }
    
}
