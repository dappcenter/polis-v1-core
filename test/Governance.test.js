const { expectRevert, time } = require('@openzeppelin/test-helpers');
const ethers = require('ethers');
const SushiToken = artifacts.require('Polis');
const MasterChef = artifacts.require('Olympus');
const Timelock = artifacts.require('Timelock');
const GovernorAlpha = artifacts.require('GovernorAlpha');
// const MockERC20 = artifacts.require('MockERC20');

function encodeParameters(types, values) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

contract('Governor', ([alice, minter, treasury2, treasury1, proposer]) => {
    it('should work', async () => {
        this.polis = await SushiToken.new({ from: alice });
        await this.polis.mint(alice, web3.utils.toWei('1000'), { from: alice });
        await this.polis.delegate(proposer, { from: proposer });
        this.olympus = await MasterChef.new(this.polis.address, web3.utils.toWei('100'), '0',{ from: alice });
        await this.polis.proposeOwner(this.olympus.address, { from: alice });
        await this.olympus.claimToken({ from: alice });
        await this.polis.approve(this.olympus.address, web3.utils.toWei('1000'), { from: alice });
        //this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
        //this.lp2 = await MockERC20.new('LPToken2', 'LP2', '10000000000', { from: minter });
        //await this.chef.add('100', this.lp.address, true, { from: alice });
        //await this.lp.approve(this.chef.address, '1000', { from: minter });
        await this.olympus.addValidators(web3.utils.toWei('100'), { from: alice });
        // Perform another deposit to make sure some SUSHIs are minted in that 1 block.
        await this.olympus.addValidators(web3.utils.toWei('0'), { from: alice });
        assert.equal((await this.polis.totalSupply()).toString(), web3.utils.toWei('1070'));
        assert.equal((await this.polis.balanceOf(alice)).toString(), web3.utils.toWei('970'));
        // Proposer needs at least 1% to propose and 4% to vote
        await this.polis.transfer(proposer, web3.utils.toWei('42.8'), { from: alice });
        // Transfer ownership to timelock contract
        this.timelock = await Timelock.new(alice, time.duration.days(2), { from: alice });
        this.gov = await GovernorAlpha.new(this.timelock.address, this.polis.address, alice, { from: alice });
        await this.timelock.setPendingAdmin(this.gov.address, { from: alice });
        await this.gov.__acceptAdmin({ from: alice });

        // Transfer olympus to timelock
        await this.olympus.proposeOwner(this.timelock.address, { from: alice });
        await this.timelock.claimAddress(this.olympus.address);
        assert.equal((await this.olympus.owner()).toString(), this.timelock.address);

        // Change the treasury addresses
        // Owner is now timelock, so alice cannot change it
        await expectRevert(
            this.olympus.setTreasury1(treasury1, { from: alice }),
            'Ownable: caller is not the owner',
        );
        // Alice doesnt have enough votes to make the proposal
        await expectRevert(
            this.gov.propose(
                [this.olympus.address, this.olympus.address], ['0', '0'], ['setTreasury1(address)', "setTreasury2(address)"],
                [encodeParameters(['address'], [treasury1]), encodeParameters(['address'], [treasury2])],
                'Change treasury1 address and treasury2 address',
                { from: alice },
            ),
            'GovernorAlpha::propose: proposer votes below proposal threshold',
        );
        // Proposer submits proposal to change treasury addresses
        assert.equal((await this.olympus.treasury1()).toString(), '0x0000000000000000000000000000000000000000');
        this.gov.propose(
            [this.olympus.address, this.olympus.address], ['0', '0'], ['setTreasury1(address)', "setTreasury2(address)"],
            [encodeParameters(['address'], [treasury1]), encodeParameters(['address'], [treasury2])],
            'Change treasury1 address and treasury2 address',
            { from: proposer },
        );
        for (let i = 0; i < 3; ++i) {
            await time.advanceBlock();
        }
        await this.gov.castVote('1', true, { from: proposer });
        await expectRevert(this.gov.queue('1'), "GovernorAlpha::queue: proposal can only be queued if it is succeeded");
        console.log("Advancing 17280 blocks. Will take a while...");
        //await time.advanceBlockTo(17280);
        for (let i = 0; i < 100; ++i) {
            await time.advanceBlock();
        }
        await this.gov.queue('1');
        await expectRevert(this.gov.execute('1'), "Timelock::executeTransaction: Transaction hasn't surpassed time lock.");
        await time.increase(time.duration.days(3));
        await this.gov.execute('1');
        assert.equal((await this.olympus.treasury1()).toString(), treasury1);
        assert.equal((await this.olympus.treasury2()).toString(), treasury2);

    }).timeout(1000000);
});