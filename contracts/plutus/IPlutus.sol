// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

interface IPlutus {

    struct DrachmaInfo {
        uint256 amount;         
        uint256 rewardDebt;     
    }

    struct RewardsInfo {
        uint256 allocPoint;         
        uint256 lastRewardBlock;
        uint256 accPolisPerShare; 
    }

    event AddDrachma(address indexed user, uint256 amount);
    event ExitDrachma(address indexed user, uint256 amount);
    event ClaimTreasury(address treasury, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);

    function halving() external;
    function setRewards(uint256 _rid, uint256 _allocPoint) external;
    function pendingPolis(address _user) external view returns (uint256);
    function massUpdateRewards() external;
    function updateReward(uint256 _rid) external;
    function addDrachmas(uint256 _amount) external;
    function exitDrachmas(uint256 _amount) external;
    function claimTreasury(uint rid) external;
    function emergencyWithdraw() external;
    function setSenate(address _addr) external;
    function setAgora(address _addr) external;
    function claimToken() external;
}