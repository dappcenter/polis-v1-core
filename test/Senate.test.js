const { expectRevert, time } = require('@openzeppelin/test-helpers');
const Polis = artifacts.require('token/Polis.sol');
const Senate = artifacts.require('senate/Senate.sol');

contract('Senate', ([tech, community, business, marketing, adoption, owner]) => {
    beforeEach(async () => {
        this.polis = await Polis.new({ from: owner });
    });

});