// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

// Assumes onlyEOA modifier previously
contract ContractGuard {
    mapping(uint256 => mapping(address => bool)) private _status;

    modifier onlyOneBlock() {
        require(
            !_status[block.number][msg.sender],
            'ContractGuard: one block, one function'
        );

        _;

        _status[block.number][msg.sender] = true;
    }
}
