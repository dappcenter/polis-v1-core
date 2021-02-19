// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../token/Polis.sol";


contract Plutus is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Info of each drachma.
    struct DrachmaInfo {
        uint256 amount;         // How many LP tokens the user has provided.
        uint256 rewardDebt;     // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of POLIS
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * reward.accPolisPerShare) - user.rewardDebt
        //
        // Whenever a user adds a drachma. Here's what happens:
        //   1. The reward's `accPolisPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each reward set.
    struct RewardsInfo {
        uint256 allocPoint;         // How many allocation points assigned to this reward.
        uint256 lastRewardBlock;    // Last block number that POLIS distribution occurs.
        uint256 accPolisPerShare;   // Accumulated POLIS per share, times 1e12. See below.
    }

    // The POLIS TOKEN
    Polis public polis;
    // POLIS tokens created per block.
    uint256 public polisPerBlock;

    // POLIS next scheduled halving
    uint256 public nextHalving;
    // 3 reward sets
    uint public constant REWARDS_LENGTH = 3;

    // Index for Drachma Rewards
    uint public constant DRACHMA_REWARDS_INDEX = 0;
    // Index for Treasury 1: Senate
    uint public constant SENATE_INDEX = 1;
    // Index for Treasury 2: Agora
    uint public constant AGORA_INDEX = 2;
    // Drachma cost in POLIS
    uint256 public constant DRACHMA_AMOUNT = 100 * 1 ether;
    // Senate address
    address public senate;
    // Agora address
    address public agora;
    // Helper vars for treasury
    uint256[REWARDS_LENGTH-1] private rewardDebts;
    // Info of each reward.
    RewardsInfo[REWARDS_LENGTH] public rewardsInfo;
    // Info of each drachma owners
    mapping(address => DrachmaInfo) public drachmaInfo;
    // Total amount locked in drachmas
    uint256 public totalDrachmasAmount = 0;
    // Total allocation poitns. Must be the sum of all allocation points in all rewards.
    uint256 public totalAllocPoint = 0;
    // The block number when POLIS mining starts.
    uint256 public startBlock;

    event AddDrachma(address indexed user, uint256 amount);
    event ExitDrachma(address indexed user, uint256 amount);
    event ClaimTreasury(address treasury, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);

    constructor(Polis _polis, uint256 _polisPerBlock, uint256 _startBlock)  {
        polis = _polis;
        polisPerBlock = _polisPerBlock;
        startBlock = _startBlock;
        // Initial drachma rewards
        addReward(70, DRACHMA_REWARDS_INDEX);
        // Senate
        addReward(20, SENATE_INDEX);
        // Agora
        addReward(10, AGORA_INDEX);
        assert(rewardsInfo[DRACHMA_REWARDS_INDEX].allocPoint == 70);
        assert(rewardsInfo[SENATE_INDEX].allocPoint == 20);
        assert(rewardsInfo[AGORA_INDEX].allocPoint == 10);

        nextHalving = block.timestamp.add(365 days);
    }

    //
    function halving() external {
        require(block.timestamp >= nextHalving);
        massUpdateRewards();
        polisPerBlock = polisPerBlock.mul(8000).div(10000);
        nextHalving = nextHalving.add(365 days);
    }

    // Add a new reward. Setup in constructor
    function addReward(uint256 _allocPoint, uint _rid) internal {
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        rewardsInfo[_rid] =
            RewardsInfo({
            allocPoint: _allocPoint,
            lastRewardBlock: lastRewardBlock,
            accPolisPerShare: 0
        });
    }

    // Update the given rewards POLIS allocation point. Can only be called by the owner.
    function setRewards(
        uint256 _rid,
        uint256 _allocPoint
    ) public onlyOwner {
        massUpdateRewards();
        totalAllocPoint = totalAllocPoint.sub(rewardsInfo[_rid].allocPoint).add(
            _allocPoint
        );
        rewardsInfo[_rid].allocPoint = _allocPoint;
    }

    // View function to see pending POLIS on frontend.
    function pendingPolis(address _user)
    external
    view
    returns (uint256)
    {
        RewardsInfo storage drachmaRewards = rewardsInfo[DRACHMA_REWARDS_INDEX];
        DrachmaInfo storage user = drachmaInfo[_user];
        uint256 accPolisPerShare = drachmaRewards.accPolisPerShare;
        if (block.number > drachmaRewards.lastRewardBlock && totalDrachmasAmount != 0) {
            uint256 multiplier = block.number.sub(drachmaRewards.lastRewardBlock);
            uint256 polisReward = multiplier.mul(polisPerBlock).mul(drachmaRewards.allocPoint).div(totalAllocPoint);
            accPolisPerShare = accPolisPerShare.add(polisReward.mul(1e12).div(totalDrachmasAmount));
        }
        return user.amount.mul(accPolisPerShare).div(1e12).sub(user.rewardDebt);
    }

    // Update reward variables for all rewards.
    function massUpdateRewards() public {
        for (uint256 rid = 0; rid < REWARDS_LENGTH; ++rid) {
            updateReward(rid);
        }
    }

    // Update reward variables to be up-to-date.
    function updateReward(uint256 _rid) public {
        RewardsInfo storage reward = rewardsInfo[_rid];
        if (block.number <= reward.lastRewardBlock) {
            return;
        }
        uint256 supply;
        if (_rid == DRACHMA_REWARDS_INDEX) {
            supply = totalDrachmasAmount;
        }
        else {
            supply = 1;
        }
        if (supply == 0) {
            reward.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = block.number.sub(reward.lastRewardBlock);
        uint256 polisReward =
        multiplier.mul(polisPerBlock).mul(reward.allocPoint).div(
            totalAllocPoint
        );
        polis.mint(address(this), polisReward);
        reward.accPolisPerShare = reward.accPolisPerShare.add(
            polisReward.mul(1e12).div(supply)
        );
        reward.lastRewardBlock = block.number;
    }

    // Deposit POLIS to add Validators
    function addDrachmas(uint256 _amount) public {
        require(msg.sender != senate && msg.sender != agora);
        // Drachma must be divisible by 100
        require(_amount.mod(DRACHMA_AMOUNT) == 0, "addDrachma: incorrect amount");
        RewardsInfo storage rewards = rewardsInfo[DRACHMA_REWARDS_INDEX];
        DrachmaInfo storage user = drachmaInfo[msg.sender];
        updateReward(DRACHMA_REWARDS_INDEX);
        if (user.amount > 0) {
            uint256 pending =
            user.amount.mul(rewards.accPolisPerShare).div(1e12).sub(
                user.rewardDebt
            );
            safePolisTransfer(msg.sender, pending);
        }
        IERC20(polis).safeTransferFrom(
            address(msg.sender),
            address(this),
            _amount
        );
        user.amount = user.amount.add(_amount);
        totalDrachmasAmount = totalDrachmasAmount.add(_amount);
        user.rewardDebt = user.amount.mul(rewards.accPolisPerShare).div(1e12);
        emit AddDrachma(msg.sender, _amount);
    }

    // Withdraw Drachmas
    function exitDrachmas(uint256 _amount) public {
        require(_amount.mod(DRACHMA_AMOUNT) == 0, "exitDrachmas: incorrect amount");
        RewardsInfo storage rewards = rewardsInfo[DRACHMA_REWARDS_INDEX];
        DrachmaInfo storage user = drachmaInfo[msg.sender];
        require(user.amount >= _amount, "exitDrachmas: incorrect amount");
        updateReward(DRACHMA_REWARDS_INDEX);
        uint256 pending =
        user.amount.mul(rewards.accPolisPerShare).div(1e12).sub(
            user.rewardDebt
        );
        safePolisTransfer(msg.sender, pending);
        user.amount = user.amount.sub(_amount);
        totalDrachmasAmount = totalDrachmasAmount.sub(_amount);
        user.rewardDebt = user.amount.mul(rewards.accPolisPerShare).div(1e12);
        IERC20(polis).safeTransfer(address(msg.sender), _amount);
        emit ExitDrachma(msg.sender, _amount);
    }

    // Claim the reward for some treasury
    function claimTreasury(uint rid) external {
        require(rid == SENATE_INDEX || rid == AGORA_INDEX, "claimTreasury: invalid reward id");
        RewardsInfo storage treasuryReward = rewardsInfo[rid];
        updateReward(rid);
        uint256 pending = treasuryReward.accPolisPerShare.div(1e12).sub(rewardDebts[rid-1]);
        address treasury;
        if (rid == SENATE_INDEX) {
            require(senate != address(0), "claimTreasury: not set yet");
            treasury = senate;
        }
        else {
            require(agora != address(0), "claimTreasury: not set yet");
            treasury = agora;
        }
        rewardDebts[rid-1] = treasuryReward.accPolisPerShare.div(1e12);
        safePolisTransfer(treasury, pending);
        emit ClaimTreasury(treasury, pending);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw() external {
        DrachmaInfo storage user = drachmaInfo[msg.sender];
        uint256 _amount = user.amount;
        user.amount = 0;
        user.rewardDebt = 0;
        IERC20(polis).safeTransfer(address(msg.sender), _amount);
        emit EmergencyWithdraw(msg.sender, _amount);
    }

    // Safe polis transfer function, just in case if rounding error causes the reward to not have enough POLIS.
    function safePolisTransfer(address _to, uint256 _amount) internal {
        uint256 polisBal = polis.balanceOf(address(this)).sub(totalDrachmasAmount);
        if (_amount > polisBal) {
            IERC20(polis).safeTransfer(_to, polisBal);
        } else {
            IERC20(polis).safeTransfer(_to, _amount);
        }
    }

    // Update senate address
    function setSenate(address _addr) external onlyOwner{
        require(_addr != address(0), "senate: invalid");
        senate = _addr;
    }

    // Update agora address
    function setAgora(address _addr) external onlyOwner{
        require(_addr != address(0), "agora: invalid");
        agora = _addr;
    }

    // Claim ownership of POLIS
    function claimToken() public onlyOwner {
        polis.claimOwnership();
    }
}