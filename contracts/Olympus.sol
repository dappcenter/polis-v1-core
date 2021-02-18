// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./token/Polis.sol";


contract Olympus is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Info of each validator.
    struct ValidatorInfo {
        uint256 amount;         // How many LP tokens the user has provided.
        uint256 rewardDebt;     // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of POLIS
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * reward.accPolisPerShare) - user.rewardDebt
        //
        // Whenever a user adds a validator. Here's what happens:
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
    // Index for Validators
    uint public constant VALIDATORS_INDEX = 0;
    // Index for Treasury 1: DAO Manifesto
    uint public constant TREASURY1_INDEX = 1;
    // Index for Treasury 2: Community Treasury
    uint public constant TREASURY2_INDEX = 2;
    // Validator cost in POLIS
    uint256 public constant VALIDATOR_AMOUNT = 100 * 1 ether;
    // Treasury 1 address
    address public treasury1;
    // Treasury 2 address
    address public treasury2;
    // Helper vars for treasury
    uint256[REWARDS_LENGTH-1] private rewardDebts;
    // Info of each reward.
    RewardsInfo[REWARDS_LENGTH] public rewardsInfo;
    // Info of each validator
    mapping(address => ValidatorInfo) public validatorInfo;
    // Total amount locked in validators
    uint256 public totalValidatorsAmount = 0;
    // Total allocation poitns. Must be the sum of all allocation points in all rewards.
    uint256 public totalAllocPoint = 0;
    // The block number when POLIS mining starts.
    uint256 public startBlock;

    event AddValidator(address indexed user, uint256 amount);
    event ExitValidator(address indexed user, uint256 amount);
    event ClaimTreasury(address treasury, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);

    constructor(Polis _polis, uint256 _polisPerBlock, uint256 _startBlock)  {
        polis = _polis;
        polisPerBlock = _polisPerBlock;
        startBlock = _startBlock;
        // Initial validator rewards
        addReward(70, VALIDATORS_INDEX);
        // Treasury1
        addReward(20, TREASURY1_INDEX);
        // Treasury 2
        addReward(10, TREASURY2_INDEX);
        assert(rewardsInfo[VALIDATORS_INDEX].allocPoint == 70);
        assert(rewardsInfo[TREASURY1_INDEX].allocPoint == 20);
        assert(rewardsInfo[TREASURY2_INDEX].allocPoint == 10);

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
        RewardsInfo storage validatorRewards = rewardsInfo[VALIDATORS_INDEX];
        ValidatorInfo storage user = validatorInfo[_user];
        uint256 accPolisPerShare = validatorRewards.accPolisPerShare;
        if (block.number > validatorRewards.lastRewardBlock && totalValidatorsAmount != 0) {
            uint256 multiplier = block.number.sub(validatorRewards.lastRewardBlock);
            uint256 polisReward = multiplier.mul(polisPerBlock).mul(validatorRewards.allocPoint).div(totalAllocPoint);
            accPolisPerShare = accPolisPerShare.add(polisReward.mul(1e12).div(totalValidatorsAmount));
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
        if (_rid == VALIDATORS_INDEX) {
            supply = totalValidatorsAmount;
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
    function addValidators(uint256 _amount) public {
        require(msg.sender != treasury1 && msg.sender != treasury2);
        // Validators must be divisible by 100
        require(_amount.mod(VALIDATOR_AMOUNT) == 0, "addValidators: incorrect amount");
        RewardsInfo storage rewards = rewardsInfo[VALIDATORS_INDEX];
        ValidatorInfo storage user = validatorInfo[msg.sender];
        updateReward(VALIDATORS_INDEX);
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
        totalValidatorsAmount = totalValidatorsAmount.add(_amount);
        user.rewardDebt = user.amount.mul(rewards.accPolisPerShare).div(1e12);
        emit AddValidator(msg.sender, _amount);
    }

    // Withdraw Validators
    function exitValidators(uint256 _amount) public {
        require(_amount.mod(VALIDATOR_AMOUNT) == 0, "exitValidators: incorrect amount");
        RewardsInfo storage rewards = rewardsInfo[VALIDATORS_INDEX];
        ValidatorInfo storage user = validatorInfo[msg.sender];
        require(user.amount >= _amount, "exitValidators: incorrect amount");
        updateReward(VALIDATORS_INDEX);
        uint256 pending =
        user.amount.mul(rewards.accPolisPerShare).div(1e12).sub(
            user.rewardDebt
        );
        safePolisTransfer(msg.sender, pending);
        user.amount = user.amount.sub(_amount);
        totalValidatorsAmount = totalValidatorsAmount.sub(_amount);
        user.rewardDebt = user.amount.mul(rewards.accPolisPerShare).div(1e12);
        IERC20(polis).safeTransfer(address(msg.sender), _amount);
        emit ExitValidator(msg.sender, _amount);
    }

    // Claim the reward for some treasury
    function claimTreasury(uint rid) external {
        require(rid == TREASURY1_INDEX || rid == TREASURY2_INDEX, "claimTreasury: invalid reward id");
        RewardsInfo storage treasuryReward = rewardsInfo[rid];
        updateReward(rid);
        uint256 pending = treasuryReward.accPolisPerShare.div(1e12).sub(rewardDebts[rid-1]);
        address treasury;
        if (rid == TREASURY1_INDEX) {
            require(treasury1 != address(0), "claimTreasury: not set yet");
            treasury = treasury1;
        }
        else {
            require(treasury2 != address(0), "claimTreasury: not set yet");
            treasury = treasury2;
        }
        rewardDebts[rid-1] = treasuryReward.accPolisPerShare.div(1e12);
        safePolisTransfer(treasury, pending);
        emit ClaimTreasury(treasury, pending);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw() external {
        ValidatorInfo storage user = validatorInfo[msg.sender];
        uint256 _amount = user.amount;
        user.amount = 0;
        user.rewardDebt = 0;
        IERC20(polis).safeTransfer(address(msg.sender), _amount);
        emit EmergencyWithdraw(msg.sender, _amount);
    }

    // Safe polis transfer function, just in case if rounding error causes the reward to not have enough POLIS.
    function safePolisTransfer(address _to, uint256 _amount) internal {
        uint256 polisBal = polis.balanceOf(address(this)) - totalValidatorsAmount;
        if (_amount > polisBal) {
            IERC20(polis).safeTransfer(_to, polisBal);
        } else {
            IERC20(polis).safeTransfer(_to, _amount);
        }
    }

    // Update treasury1 address
    function setTreasury1(address _t1) external onlyOwner{
        require(_t1 != address(0), "treasury1: invalid");
        treasury1 = _t1;
    }

    // Update treasury2 address
    function setTreasury2(address _t2) external onlyOwner{
        require(_t2 != address(0), "treasury2: invalid");
        treasury2 = _t2;
    }

    // Claim ownership of POLIS
    function claimToken() public onlyOwner {
        polis.claimOwnership();
    }
}