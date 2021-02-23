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

    // Info of each user.
    struct UserInfo {
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
        IERC20 lpToken;             // Address of LP token contract.
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

    // Treasuries
    uint public TREASURY_LENGTH;
    // Index for Treasury 1: Senate
    uint public constant SENATE_INDEX = 0;
    // Index for Treasury 2: Agora
    uint public constant AGORA_INDEX = 1;
    // Info of each treasury
    RewardsInfo[] public treasuryInfo;
    // Helper vars for treasury
    uint256[] private treasuryDebts;
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

    event Deposit(address indexed user, uint256 indexed rid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed rid, uint256 amount);
    event ClaimTreasury(address treasury, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed rid, uint256 amount);

    constructor(Polis _polis, uint256 _polisPerBlock, uint256 _startBlock)  {
        require(_polisPerBlock > 0);
        polis = _polis;
        polisPerBlock = _polisPerBlock;
        startBlock = _startBlock;

        initialize();
        nextHalving = block.timestamp.add(365 days);
    }

    // Initialize the drachma and treasury data
    function initialize() internal {
        // Initial drachma rewards
        addReward(70, IERC20(polis));
        // Senate
        addTreasury(20);
        // Agora
        addTreasury(10);
    }

    function halving() external {
        require(block.timestamp >= nextHalving);
        massUpdateRewards();
        polisPerBlock = polisPerBlock.mul(8000).div(10000);
        nextHalving = nextHalving.add(365 days);
    }

    // Add a new reward.
    function addReward(uint256 _allocPoint, IERC20 _lpToken) public onlyOwner {
        checkRewardDuplicate(_lpToken);
        massUpdateRewards();
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        rewardsInfo.push(
            RewardsInfo({
                lpToken: _lpToken,
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accPolisPerShare: 0
        }));
    }

    // Add a new treasury. Setup in constructor
    function addTreasury(uint256 _allocPoint) public onlyOwner {
        massUpdateRewards();
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        treasuryInfo.push(
            RewardsInfo({
                lpToken: IERC20(polis),
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accPolisPerShare: 0
            }));
        TREASURY_LENGTH += 1;
        treasuryDebts.push(0);
    }

    // Update the given rewards or treasury POLIS allocation point.
    function setPercentage(
        uint256 _id,
        uint256 _allocPoint,
        bool isTreasury
    ) public onlyOwner {
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

    // View function to see pending POLIS on frontend.
    function pendingPolis(uint256 _rid, address _user)
    external
    view
    returns (uint256)
    {
        RewardsInfo storage reward = rewardsInfo[_rid];
        UserInfo storage user = userInfo[_rid][_user];
        uint256 accPolisPerShare = reward.accPolisPerShare;
        uint256 lpSupply;
        if(_rid == DRACHMA_INDEX) {
            lpSupply = totalDrachmasAmount;
        }
        else {
            lpSupply = reward.lpToken.balanceOf(address(this));
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
        for (uint256 rid = 0; rid < TREASURY_LENGTH; ++rid) {
            updateReward(rid, true);
        }
    }

    // Update reward variables to be up-to-date.
    function updateReward(uint256 _rid, bool isTreasury) public {
        // require(polis.owner() == address(this), "plutus doesn't own polis");
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
                supply = reward.lpToken.balanceOf(address(this));
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
    function depositToken(uint256 _rid, uint256 _amount) public {
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
            safePolisTransfer(msg.sender, pending);
        }
        if(_amount > 0) {
            rewards.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
            if (_rid == DRACHMA_INDEX) {
                totalDrachmasAmount = totalDrachmasAmount.add(_amount);
            }
        }
        user.rewardDebt = user.amount.mul(rewards.accPolisPerShare).div(1e12);
        emit Deposit(msg.sender, _rid, _amount);
    }

    // Withdraw some reward token
    function withdrawToken(uint256 _rid, uint256 _amount) public {
        if (_rid == DRACHMA_INDEX) {
            // Drachma must be divisible by 100
            require(_amount.mod(DRACHMA_AMOUNT) == 0, "withdrawToken: incorrect POLIS amount");
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
            reward.lpToken.safeTransfer(address(msg.sender), _amount);
            if (_rid == DRACHMA_INDEX) {
                totalDrachmasAmount = totalDrachmasAmount.sub(_amount);
            }
        }
        user.rewardDebt = user.amount.mul(reward.accPolisPerShare).div(1e12);
        emit Withdraw(msg.sender, _rid, _amount);
    }

    // Claim the reward for some treasury
    function claimTreasury(uint _tid) external {
        require(_tid == SENATE_INDEX || _tid == AGORA_INDEX, "claimTreasury: invalid reward id");
        RewardsInfo storage treasuryReward = rewardsInfo[_tid];
        updateReward(_tid, true);
        uint256 pending = treasuryReward.accPolisPerShare.div(1e12).sub(treasuryDebts[_tid]);
        address treasury;
        if (_tid == SENATE_INDEX) {
            require(senate != address(0), "claimTreasury: not set yet");
            treasury = senate;
        }
        else {
            require(agora != address(0), "claimTreasury: not set yet");
            treasury = agora;
        }
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
        reward.lpToken.safeTransfer(address(msg.sender), _amount);
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

    function checkRewardDuplicate(IERC20 _lpToken) public view {
        uint256 length = rewardsInfo.length;
        for(uint256 rid = 0; rid < length ; ++rid) {
            require (rewardsInfo[rid].lpToken != _lpToken , "duplicated!");
        }
    }

    function getRewardsLength() public view returns(uint) {
        return rewardsInfo.length;
    }

    function getDepositedAmount(uint _pid, address _user) external view returns(uint256) {
        return userInfo[_pid][_user].amount;
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
    function claimToken() public {
        polis.claimOwnership();
    }

    // Propose ownership of POLIS
    function proposePolisOwner(address _owner) public onlyOwner {
        polis.proposeOwner(_owner);
    }
}