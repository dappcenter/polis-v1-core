// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../token/Polis.sol";
import "../token/Validator.sol";

contract Plutus is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfo {
        uint256 amount;         // How many tokens the user has provided.
        uint256 rewardDebt;     // Reward debt.
        // Basically, any point in time, the amount of POLIS
        // entitled to a user but is pending to be distributed is:
        //   pending reward = (user.amount * reward.accPolisPerShare) - user.rewardDebt
    }

    // Info of each reward set.
    struct RewardsInfo {
        IERC20 token;               // Address of token contract.
        uint256 allocPoint;         // How many allocation points assigned to this reward.
        uint256 lastRewardBlock;    // Last block number that POLIS distribution occurs.
        uint256 accPolisPerShare;   // Accumulated POLIS per share, times 1e12.
    }

    // The POLIS TOKEN
    Polis public polis;
    // POLIS tokens created per block.
    uint256 public polisPerBlock;
    // POLIS next scheduled halving
    uint256 public nextHalving;

    // The Validator Token, used to vote in governance
    Validator immutable validator;

    // Treasuries
    uint public constant TREASURY_LENGTH = 2;
    // Index for Treasury 1: Senate
    uint public constant SENATE_INDEX = 0;
    // Index for Treasury 2: Agora
    uint public constant AGORA_INDEX = 1;
    // Info of each treasury
    RewardsInfo[TREASURY_LENGTH] public treasuryInfo;
    // Helper vars for treasury
    uint256[TREASURY_LENGTH] public treasuryDebts;
    // Senate address
    address public senate;
    // Agora address
    address public agora;

    // Index for POLIS rewards.
    uint256 public constant DRACHMA_INDEX = 0;
    // Drachma cost for POLIS.
    uint256 public constant DRACHMA_AMOUNT = 100 * 1 ether;
    // Info of each reward available for the user
    RewardsInfo[] public rewardsInfo;
    // Info of each user
    mapping(uint256 => mapping (address => UserInfo)) public userInfo;
    // Total amount locked in POLIS drachmas
    uint256 public totalDrachmasAmount = 0;
    // Total allocation points. Must be the sum of all allocation points in all rewards.
    uint256 public totalAllocPoint = 0;
    // The block number when POLIS mining starts.
    uint256 public startBlock;

    modifier tokensClaimed() {
        require(polis.owner() == address(this) && validator.owner() == address(this), "Plutus does not own required tokens");
        _;
    }

    event DepositToken(address indexed user, uint256 indexed rid, uint256 amount);
    event WithdrawToken(address indexed user, uint256 indexed rid, uint256 amount);
    event ClaimTreasury(address treasury, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed rid, uint256 amount);

    constructor(Polis _polis, Validator _val, uint256 _polisPerBlock, uint256 _startBlock)  {
        require(_polisPerBlock > 0);
        polis = _polis;
        validator = _val;
        polisPerBlock = _polisPerBlock;
        startBlock = _startBlock;
        // Initialize Drachma and treasury data
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        // Senate
        addTreasury(SENATE_INDEX, 20, lastRewardBlock);
        // Agora
        addTreasury(AGORA_INDEX, 10, lastRewardBlock);
        // Initial drachma rewards. This one guarantees that polis staking rewards match DRACHMA_INDEX
        totalAllocPoint = totalAllocPoint.add(70);
        rewardsInfo.push(
            RewardsInfo({
        token: IERC20(polis),
        allocPoint: 70,
        lastRewardBlock: lastRewardBlock,
        accPolisPerShare: 0
        }));
        assert(totalAllocPoint == 100);
        nextHalving = block.timestamp.add(365 days);
    }

    function halving() external {
        require(block.timestamp >= nextHalving);
        massUpdateRewards();
        polisPerBlock = polisPerBlock.mul(8000).div(10000);
        nextHalving = nextHalving.add(365 days);
    }

    // Add a new reward.
    function addReward(uint256 _allocPoint, IERC20 _token) public onlyOwner {
        checkRewardDuplicate(_token);
        massUpdateRewards();
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        rewardsInfo.push(
            RewardsInfo({
                token: _token,
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accPolisPerShare: 0
        }));
    }

    // Add a new treasury. Setup in initialization
    function addTreasury(uint256 _tid, uint256 _allocPoint, uint256 _lastRW) internal {
        treasuryInfo[_tid] = RewardsInfo(IERC20(polis), _allocPoint, _lastRW, 0);
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
    }

    // Update the given rewards or treasury POLIS allocation point.
    function setPercentage(uint256 _id, uint256 _allocPoint, bool isTreasury) public onlyOwner {
        massUpdateRewards();
        if(isTreasury) {
            totalAllocPoint = totalAllocPoint.sub(treasuryInfo[_id].allocPoint).add(
                _allocPoint
            );
            treasuryInfo[_id].allocPoint = _allocPoint;
        }
        else {
            totalAllocPoint = totalAllocPoint.sub(rewardsInfo[_id].allocPoint).add(
                _allocPoint
            );
            rewardsInfo[_id].allocPoint = _allocPoint;
        }
    }

    // View function to see pending POLIS on frontend from user.
    function pendingPolis(uint256 _rid, address _user) external view returns (uint256) {
        RewardsInfo storage reward = rewardsInfo[_rid];
        UserInfo storage user = userInfo[_rid][_user];
        uint256 accPolisPerShare = reward.accPolisPerShare;
        uint256 lpSupply;
        if(_rid == DRACHMA_INDEX) {
            lpSupply = totalDrachmasAmount;
        }
        else {
            lpSupply = reward.token.balanceOf(address(this));
        }

        if (block.number > reward.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = block.number.sub(reward.lastRewardBlock);
            uint256 polisReward = multiplier.mul(polisPerBlock).mul(reward.allocPoint).div(totalAllocPoint);
            accPolisPerShare = accPolisPerShare.add(polisReward.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(accPolisPerShare).div(1e12).sub(user.rewardDebt);
    }

    // Update reward variables for all rewards.
    function massUpdateRewards() public {
        for (uint256 rid = 0; rid < rewardsInfo.length; ++rid) {
            updateReward(rid, false);
        }
        for (uint256 tid = 0; tid < TREASURY_LENGTH; ++tid) {
            updateReward(tid, true);
        }
    }

    // Update reward variables to be up-to-date.
    function updateReward(uint256 _rid, bool isTreasury) public {
        RewardsInfo storage reward;
        uint256 supply;
        if(isTreasury) {
            reward = treasuryInfo[_rid];
            supply = 1;
        }
        else {
            reward = rewardsInfo[_rid];
            if (_rid == DRACHMA_INDEX) {
                supply = totalDrachmasAmount;
            }
            else {
                supply = reward.token.balanceOf(address(this));
            }
        }

        if (block.number <= reward.lastRewardBlock) {
            return;
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

    // Deposit some reward token to get polis
    function depositToken(uint256 _rid, uint256 _amount) public tokensClaimed{
        require ( _rid < rewardsInfo.length , "deposit: pool exists?");
        require(msg.sender != senate && msg.sender != agora);

        if (_rid == DRACHMA_INDEX) {
            // Drachma must be divisible by 100
            require(_amount.mod(DRACHMA_AMOUNT) == 0, "depositToken: incorrect POLIS amount");
        }
        RewardsInfo storage rewards = rewardsInfo[_rid];
        UserInfo storage user = userInfo[_rid][msg.sender];
        updateReward(_rid, false);
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(rewards.accPolisPerShare).div(1e12).sub(user.rewardDebt);
            if(pending > 0) {
                safePolisTransfer(msg.sender, pending);
            }
        }
        if(_amount > 0) {
            rewards.token.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
            if (_rid == DRACHMA_INDEX) {
                totalDrachmasAmount = totalDrachmasAmount.add(_amount);
                // Mint the validators to drachma user
                validator.mint(address(msg.sender), _amount);
            }
        }
        user.rewardDebt = user.amount.mul(rewards.accPolisPerShare).div(1e12);
        emit DepositToken(msg.sender, _rid, _amount);
    }

    // Withdraw some reward token
    function withdrawToken(uint256 _rid, uint256 _amount) public tokensClaimed{
        if (_rid == DRACHMA_INDEX) {
            // Drachma must be divisible by 100
            require(_amount.mod(DRACHMA_AMOUNT) == 0, "withdrawToken: incorrect DRACHMA amount");
        }
        RewardsInfo storage reward = rewardsInfo[_rid];
        UserInfo storage user = userInfo[_rid][msg.sender];
        require(user.amount >= _amount, "withdrawToken: incorrect amount");
        updateReward(_rid, false);
        uint256 pending = user.amount.mul(reward.accPolisPerShare).div(1e12).sub(user.rewardDebt);
        if(pending > 0) {
            safePolisTransfer(msg.sender, pending);
        }
        if(_amount > 0) {
            user.amount = user.amount.sub(_amount);
            reward.token.safeTransfer(address(msg.sender), _amount);
            if (_rid == DRACHMA_INDEX) {
                totalDrachmasAmount = totalDrachmasAmount.sub(_amount);
                // Burn the validators from drachma user
                validator.burn(address(msg.sender), _amount);
            }
        }
        user.rewardDebt = user.amount.mul(reward.accPolisPerShare).div(1e12);
        emit WithdrawToken(msg.sender, _rid, _amount);
    }

    // Claim the reward for some treasury
    function claimTreasury(uint _tid) external {
        require(_tid < TREASURY_LENGTH, "claimTreasury: invalid reward id");
        RewardsInfo storage treasuryReward = treasuryInfo[_tid];
        updateReward(_tid, true);
        address treasury;
        if (_tid == SENATE_INDEX) {
            require(senate != address(0), "claimTreasury: not set yet");
            treasury = senate;
        }
        else {
            require(agora != address(0), "claimTreasury: not set yet");
            treasury = agora;
        }
        uint256 pending = treasuryReward.accPolisPerShare.div(1e12).sub(treasuryDebts[_tid]);
        treasuryDebts[_tid] = treasuryReward.accPolisPerShare.div(1e12);
        safePolisTransfer(treasury, pending);
        emit ClaimTreasury(treasury, pending);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _rid) external {
        UserInfo storage user = userInfo[_rid][msg.sender];
        RewardsInfo storage reward = rewardsInfo[_rid];
        uint256 _amount = user.amount;
        user.amount = 0;
        user.rewardDebt = 0;
        reward.token.safeTransfer(address(msg.sender), _amount);
        emit EmergencyWithdraw(msg.sender, _rid, _amount);
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

    // Helper function to check if a token has already been added as a reward.
    function checkRewardDuplicate(IERC20 _token) public view {
        uint256 length = rewardsInfo.length;
        for(uint256 rid = 0; rid < length ; ++rid) {
            require (rewardsInfo[rid].token != _token , "duplicated!");
        }
    }

    // Helper function to get the amount of tokens added as reward.
    function getRewardsLength() external view returns(uint) {
        return rewardsInfo.length;
    }

    // Get the token amount deposited for a specific reward
    function getDepositedAmount(uint _rid, address _user) external view returns(uint256) {
        return userInfo[_rid][_user].amount;
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

    // Claim ownership of address
    function claimToken(address _token) public {
        Ownable(_token).claimOwnership();
    }

    // Propose ownership of polis to address
    function proposePolisOwner(address _owner) public onlyOwner {
        polis.proposeOwner(_owner);
    }
}