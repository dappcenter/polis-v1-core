// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

// Only allows one call from user/contract to a set of functions in the same block
contract ContractGuard {
    mapping(uint256 => mapping(address => bool)) private _status;

    function checkSameSenderReentranted() internal view returns (bool) {
        return _status[block.number][msg.sender];
    }

    modifier onlyOneBlock() {

        require(
            !checkSameSenderReentranted(),
            'ContractGuard: one block, one function'
        );

        _;

        _status[block.number][msg.sender] = true;
    }
}
