// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../plutus/Plutus.sol";

contract Agora is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    Plutus immutable plutus;
    IERC20 immutable polis;

    event TreasurySent(address recipient, uint256 amount);

    constructor(Plutus _plutus, IERC20 _polis) {
        plutus = _plutus;
        polis = _polis;
    }
    
    // ** View functions ** //

    function getTreasuryBalance() external view returns(uint256) {
        return polis.balanceOf(address(this));
    }

    // Amounts that treasury can claim from plutus at current block
    function pendingFunds() public view returns(uint256) {
        (, uint256 alloc, uint256 lastRewardBlock, uint256 polisShare) = plutus.treasuryInfo();
        uint256 debt = plutus.treasuryDebt();
        if (block.number > lastRewardBlock) {
            uint256 multiplier = block.number.sub(lastRewardBlock);
            uint256 polisReward = multiplier.mul(plutus.polisPerBlock()).mul(alloc).div(plutus.totalAllocPoint());
            polisShare = polisShare.add(polisReward.mul(1e12));
        }
        return polisShare.div(1e12).sub(debt);
    }

    // ** Public functions ** //

    function claimFunding() public {
        plutus.claimTreasury();
    }

    function fundAddress(address _recipient, uint256 _amount) external onlyOwner {
        if(polis.balanceOf(address(this)) < _amount) {
            require(polis.balanceOf(address(this)) + pendingFunds() >= _amount, "fundAddress: not enough funds for request");
            claimFunding();
        }
        polis.safeTransfer(_recipient, _amount);
        emit TreasurySent(_recipient, _amount);
    }


    function extractToken(address _recipient, uint256 _amount, IERC20 _token) external onlyOwner {
        require(address(_token) != address(polis), "invalid");
        require(_token.balanceOf(address(this)) >= _amount, "not enough balance");
        _token.safeTransfer(_recipient, _amount);
    }
}
