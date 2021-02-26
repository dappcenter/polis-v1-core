// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../plutus/Plutus.sol";

contract Agora is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    Plutus plutus;
    IERC20 polis;

    uint public constant AGORA_INDEX = 1;

    event TreasurySent(address recipient, uint256 amount);

    constructor(address _plutus, address _polis) {
        plutus = Plutus(_plutus);
        polis = IERC20(_polis);
    }
    
    // ** View functions ** //

    function getTreasuryBalance() external view returns(uint256) {
        return polis.balanceOf(address(this));
    }

    // Amounts that treasury can claim from plutus at current block
    function pendingFunds() public view returns(uint256) {
        (, uint256 alloc, uint256 lastRewardBlock, uint256 polisShare) = plutus.treasuryInfo(AGORA_INDEX);
        uint256 debt = plutus.treasuryDebts(AGORA_INDEX);
        if (block.number > lastRewardBlock) {
            uint256 multiplier = block.number.sub(lastRewardBlock);
            uint256 polisReward = multiplier.mul(plutus.polisPerBlock()).mul(alloc).div(plutus.totalAllocPoint());
            polisShare = polisShare.add(polisReward.mul(1e12));
        }
        return polisShare.div(1e12).sub(debt);
    }

    // ** Public functions ** //

    function claimFunding() public {
        plutus.claimTreasury(AGORA_INDEX);
    }

    function fundAddress(address _recipient, uint256 _amount) external onlyOwner {
        if(polis.balanceOf(address(this)) < _amount) {
            require(polis.balanceOf(address(this)) + pendingFunds() >= _amount, "fundAddress: not enough funds for request");
            claimFunding();
        }
        polis.safeTransfer(_recipient, _amount);
        emit TreasurySent(_recipient, _amount);
    }
}