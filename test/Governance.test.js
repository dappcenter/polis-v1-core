const { expectRevert, time } = require('@openzeppelin/test-helpers');
const ethers = require('ethers');
const Polis = artifacts.require('Polis');
const Plutus = artifacts.require('Plutus');
const Timelock = artifacts.require('Timelock');
const GovernorAlpha = artifacts.require('governance/GovernorAlpha');
const GovernorOmega = artifacts.require('governance/GovernorOmega');
const Agora = artifacts.require('agora/Agora.sol');

function encodeParameters(types, values) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

contract('Governance', ([alice, senate, agora, proposer, voter, dev, project1]) => {
    beforeEach(async () => {
        this.polis = await Polis.new({ from: alice });
        await this.polis.mint(alice, web3.utils.toWei('1000'), { from: alice });
    });
    // GovernorAlpha (temporary name) allows a decentralized control of Plutus
    it('should allow GovernorAlpha to control Plutus', async () => {
        this.plutus = await Plutus.new(this.polis.address, web3.utils.toWei('100'), '0',{ from: alice });
        await this.polis.proposeOwner(this.plutus.address, { from: alice });
        await this.plutus.claimToken({ from: alice });
        await this.polis.approve(this.plutus.address, web3.utils.toWei('1000'), { from: alice });
        await this.plutus.depositToken('0', web3.utils.toWei('100'), { from: alice });
        // Perform another deposit to make sure some POLIS are minted in that 1 block.
        await this.plutus.depositToken('0', web3.utils.toWei('0'), { from: alice });
        assert.equal((await this.polis.totalSupply()).toString(), web3.utils.toWei('1070'));
        assert.equal((await this.polis.balanceOf(alice)).toString(), web3.utils.toWei('970'));

        // Transfer ownership to timelock contract
        this.timelock = await Timelock.new(alice, time.duration.days(2), { from: alice });
        this.gov = await GovernorAlpha.new(this.timelock.address, this.polis.address, alice, { from: alice });
        await this.timelock.setPendingAdmin(this.gov.address, { from: alice });
        await this.gov.__acceptAdmin({ from: alice });

        // Proposer needs at least 1% to propose and 4% votes to pass the proposal
        // transfer 4% so votes can get quorum
        await this.polis.transfer(voter, web3.utils.toWei('42.8'), { from: alice });
        // 0.99% cannot propose
        await this.polis.transfer(proposer, web3.utils.toWei('10.6'), { from: alice });
        await this.polis.delegate(voter, { from: voter });
        await this.polis.delegate(proposer, { from: proposer });

        // Transfer plutus to timelock
        await this.plutus.proposeOwner(this.timelock.address, { from: alice });
        await this.timelock.claimAddress(this.plutus.address);
        assert.equal((await this.plutus.owner()).toString(), this.timelock.address);

        // Change the treasury addresses
        // Owner is now timelock, so alice cannot change it
        await expectRevert(
            this.plutus.setSenate(senate, { from: alice }),
            'Ownable: caller is not the owner',
        );
        // Proposal doesnt have enough votes to make the proposal
        await expectRevert(
            this.gov.propose(
                [this.plutus.address, this.plutus.address], ['0', '0'], ['setSenate(address)', "setAgora(address)"],
                [encodeParameters(['address'], [senate]), encodeParameters(['address'], [agora])],
                'Change treasury1 address and treasury2 address',
                { from: proposer },
            ),
            'GovernorAlpha::propose: proposer votes below proposal threshold',
        );
        // missing 0.011% to proposer
        await this.polis.transfer(proposer, web3.utils.toWei('0.1000000001'), { from: alice });
        // Proposer submits proposal to change treasury addresses
        assert.equal((await this.plutus.senate()).toString(), '0x0000000000000000000000000000000000000000');
        assert.equal((await this.plutus.agora()).toString(), '0x0000000000000000000000000000000000000000');
        this.gov.propose(
            [this.plutus.address, this.plutus.address], ['0', '0'], ['setSenate(address)', "setAgora(address)"],
            [encodeParameters(['address'], [senate]), encodeParameters(['address'], [agora])],
            'Change treasury1 address and treasury2 address',
            { from: proposer },
        );
        for (let i = 0; i < 3; ++i) {
            await time.advanceBlock();
        }

        await this.gov.castVote('1', true, { from: voter });
        await expectRevert(this.gov.queue('1'), "GovernorAlpha::queue: proposal can only be queued if it is succeeded");
        console.log("Advancing 100 blocks...");
        // For this test to work, (temporally) modify Governance contract for a voting period of 100 blocks. This to make the test run faster.
        //await time.advanceBlockTo(17280);
        for (let i = 0; i < 100; ++i) {
            await time.advanceBlock();
        }
        await this.gov.queue('1');
        await expectRevert(this.gov.execute('1'), "Timelock::executeTransaction: Transaction hasn't surpassed time lock.");
        await time.increase(time.duration.days(3));
        await this.gov.execute('1');
        assert.equal((await this.plutus.senate()).toString(), senate);
        assert.equal((await this.plutus.agora()).toString(), agora);

        // Move ownership of polis to alice
        assert.equal((await this.polis.owner()).toString(), this.plutus.address);
        // Proposal
        this.gov.propose(
            [this.plutus.address], ['0'], ['proposePolisOwner(address)'],
            [encodeParameters(['address'], [alice])],
            'Propose alice as polisowner',
            { from: proposer },
        );
        for (let i = 0; i < 3; ++i) {
            await time.advanceBlock();
        }
        await this.gov.castVote('2', true, { from: voter });
        // 17280
        for (let i = 0; i < 100; ++i) {
            await time.advanceBlock();
        }
        await this.gov.queue('2');
        await time.increase(time.duration.days(3));
        await this.gov.execute('2');
        await this.polis.claimOwnership({from: alice});
        assert.equal((await this.polis.owner()).toString(), alice);

    }).timeout(1000000);


    // GovernorOmega controls the Treasury. It has lesser requirements for proposal and voting
    it('should allow GovernorOmega to control Agora', async () => {
        this.plutus = await Plutus.new(this.polis.address, web3.utils.toWei('100'), '0',{ from: alice });
        await this.polis.proposeOwner(this.plutus.address, { from: alice });
        await this.plutus.claimToken({ from: alice });
        // Transfer ownership of Agora to a DIFFERENT timelock contract
        this.timelockOmega = await Timelock.new(alice, time.duration.days(2), { from: alice });
        this.govOmega = await GovernorOmega.new(this.timelockOmega.address, this.polis.address, alice, { from: alice });
        await this.timelockOmega.setPendingAdmin(this.govOmega.address, { from: alice });
        await this.govOmega.__acceptAdmin({ from: alice });

        // Proposer needs at least 100 POLIS to propose and 4% votes to pass the proposal
        // transfer 4% so votes can get quorum
        console.log((await this.govOmega.quorumVotes()).toString());
        console.log((await this.govOmega.proposalThreshold()).toString());

        await this.polis.transfer(voter, web3.utils.toWei('40'), { from: alice });
        await this.polis.transfer(proposer, web3.utils.toWei('99'), { from: alice });
        await this.polis.delegate(voter, { from: voter });
        await this.polis.delegate(proposer, { from: proposer });

        // Create and transfer Agora to timelock
        this.agora = await Agora.new(this.plutus.address, this.polis.address, { from: dev })
        await this.plutus.setAgora(this.agora.address, { from: alice });
        await this.agora.proposeOwner(this.timelockOmega.address, { from: dev });
        await this.timelockOmega.claimAddress(this.agora.address);
        assert.equal((await this.agora.owner()).toString(), this.timelockOmega.address);

        // Fund a proposed address from the governance
        // Owner is now timelock, so dev cannot change it
        await expectRevert(
            this.agora.fundAddress(project1, '100', { from: dev }),
            'Ownable: caller is not the owner',
        );
        // Proposal doesnt have enough votes to make the proposal
        await expectRevert(
            this.govOmega.propose(
                [this.agora.address], ['0'], ['fundAddress(address,uint256)'],
                [encodeParameters(['address', 'uint256'], [project1, web3.utils.toWei('1000')])],
                'Fund Project1 with 1000 POLIS',
                { from: proposer },
            ),
            'GovernorOmega::propose: proposer votes below proposal threshold',
        );
        // Transfer min to propose
        await this.polis.transfer(proposer, web3.utils.toWei('1.000001'), { from: alice });
        console.log((await this.polis.balanceOf(proposer)).toString());
        this.govOmega.propose(
            [this.agora.address], ['0'], ['fundAddress(address,uint256)'],
            [encodeParameters(['address', 'uint256'], [project1, web3.utils.toWei('1000')])],
            'Fund Project1 with 1000 POLIS',
            { from: proposer },
        );
        for (let i = 0; i < 3; ++i) {
            await time.advanceBlock();
        }

        await this.govOmega.castVote('1', true, { from: voter });
        await expectRevert(this.govOmega.queue('1'), "GovernorOmega::queue: proposal can only be queued if it is succeeded");
        console.log("Advancing 100 blocks...");
        // For this test to work, (temporally) modify Governance contract for a voting period of 100 blocks. This to make the test run faster.
        //await time.advanceBlockTo(17280);
        for (let i = 0; i < 100; ++i) {
            await time.advanceBlock();
        }
        await this.govOmega.queue('1');
        await expectRevert(this.govOmega.execute('1'), "Timelock::executeTransaction: Transaction hasn't surpassed time lock.");
        await time.increase(time.duration.days(3));
        await this.govOmega.execute('1');
        assert.equal((await this.polis.balanceOf(project1)).toString(), web3.utils.toWei('1000'));
    }).timeout(1000000);

});
