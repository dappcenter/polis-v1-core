// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPlutus {

    struct UserInfo {
        uint256 amount;         
        uint256 rewardDebt;     
    }

    struct RewardsInfo {
        IERC20 token;
        uint256 allocPoint;         
        uint256 lastRewardBlock;
        uint256 accPolisPerShare; 
    }

    event DepositToken(address indexed user, uint256 indexed rid, uint256 amount);
    event WithdrawToken(address indexed user, uint256 indexed rid, uint256 amount);
    event ClaimTreasury(address treasury, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed rid, uint256 amount);

    function polis() external view returns(address);
    function SENATE_INDEX() external view returns(uint);
    function AGORA_INDEX() external view returns(uint);
    function halving() external;
    function addReward(uint256 _allocPoint, IERC20 _token) external;
    function setPercentage(uint256 _id, uint256 _allocPoint, bool isTreasury) external;
    function pendingPolis(uint256 _rid, address _user) external view returns(uint256);
    function massUpdateRewards() external;
    function updateReward(uint256 _rid, bool isTreasury) external;
    function depositToken(uint256 _rid, uint256 _amount) external;
    function withdrawToken(uint256 _rid, uint256 _amount) external;
    function claimTreasury(uint _tid) external;
    function emergencyWithdraw(uint256 _rid) external;
    function checkRewardDuplicate(IERC20 _token) external view;
    function getRewardsLength() external view returns(uint);
    function getDepositedAmount(uint _pid, address _user) external view returns(uint256);
    function setSenate(address _addr) external;
    function setAgora(address _addr) external;
    function claimToken() external;
}