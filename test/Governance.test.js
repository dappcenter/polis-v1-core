const { expectRevert, time } = require('@openzeppelin/test-helpers');
const ethers = require('ethers');
const Polis = artifacts.require('token/Polis');
const Validator = artifacts.require('token/Validator');
const Plutus = artifacts.require('plutus/Plutus');
const Timelock = artifacts.require('Timelock');
const GovernorAlpha = artifacts.require('governance/PolisAssembly');
const GovernorOmega = artifacts.require('governance/PolisParliament');
const Agora = artifacts.require('agora/Agora.sol');

function encodeParameters(types, values) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

// ** Change the parameter votingPeriod() to 100 for testing!! (and dont forget to change it BACK) ** //
contract('Governance', ([alice, agora, proposer, voter, dev, project1]) => {
    beforeEach(async () => {
        this.polis = await Polis.new({ from: alice });
        this.validators = await Validator.new({ from: alice });
        await this.polis.mint(alice, web3.utils.toWei('100000'), { from: alice });
        await this.polis.mint(proposer, web3.utils.toWei('1500'), { from: alice });
        await this.polis.mint(voter, web3.utils.toWei('60000'), { from: alice });
        this.plutus = await Plutus.new(this.polis.address, this.validators.address, web3.utils.toWei('100'), '0',{ from: alice });
        await this.polis.proposeOwner(this.plutus.address, { from: alice });
        await this.plutus.claimToken(this.polis.address, { from: alice });
        await this.validators.proposeOwner(this.plutus.address, { from: alice });
        await this.plutus.claimToken(this.validators.address, { from: alice });
        await this.polis.approve(this.plutus.address, web3.utils.toWei('100000'), { from: alice });
        await this.polis.approve(this.plutus.address, web3.utils.toWei('100000'), { from: voter });
        await this.polis.approve(this.plutus.address, web3.utils.toWei('100000'), { from: proposer });
    });

    it('should get Governance Votes from Plutus', async () => {
        await this.plutus.depositToken('0', web3.utils.toWei('100'), { from: alice });
        assert.equal((await this.validators.totalSupply()).toString(), web3.utils.toWei('100'));
        assert.equal((await this.validators.balanceOf(alice)).toString(), web3.utils.toWei('100'));
        // Withdraw DRACHMA, lose votes
        await this.plutus.withdrawToken('0', web3.utils.toWei('100'), { from: alice });
        assert.equal((await this.validators.totalSupply()).toString(), '0');
        assert.equal((await this.validators.balanceOf(alice)).toString(), '0');
    });
    // PolisAssembly allows a decentralized control of Plutus
    it('should allow PolisAssembly to control Plutus', async () => {
        // Transfer ownership to timelock contract
        this.timelock = await Timelock.new(alice, time.duration.days(2), { from: alice });
        // Create Governance with Validators as votes
        this.gov = await GovernorAlpha.new(this.timelock.address, this.validators.address, alice, { from: alice });
        await this.timelock.setPendingAdmin(this.gov.address, { from: alice });
        await this.gov.__acceptAdmin({ from: alice });

        // Proposer needs > 1.5% to propose and 35% votes to pass the proposal
        // deposit 35% so votes can get quorum
        await this.plutus.depositToken('0', web3.utils.toWei('35000'), { from: voter });
        await this.plutus.depositToken('0', web3.utils.toWei('1000'), { from: proposer });
        await this.plutus.depositToken('0', web3.utils.toWei('63500'), { from: alice });
        // At this point, the supply of votes is 99500, the 1.5% is 1492
        await this.validators.delegate(voter, { from: voter });
        await this.validators.delegate(proposer, { from: proposer });

        // Transfer plutus to timelock
        await this.plutus.proposeOwner(this.timelock.address, { from: alice });
        await this.timelock.claimAddress(this.plutus.address);
        assert.equal((await this.plutus.owner()).toString(), this.timelock.address);

        // Change the treasury addresses
        // Owner is now timelock, so alice cannot change it
        await expectRevert(
            this.plutus.setAgora(agora, { from: alice }),
            'Ownable: caller is not the owner',
        );
        // Proposal doesnt have enough votes to make the proposal
        await expectRevert(
            this.gov.propose(
                [this.plutus.address], ['0'], ["setAgora(address)"],
                [encodeParameters(['address'], [agora])],
                'Change Agora address',
                { from: proposer },
            ),
            'PolisAssembly::propose: proposer votes below proposal threshold',
        );
        // Proposer gets 500 more votes. The Supply is now 100000, the 1.5% is 1500 and proposer has 1500. Voter has 35% (35000)
        await this.plutus.depositToken('0', web3.utils.toWei('500'), { from: proposer });
        assert.equal((await this.gov.quorumVotes()).toString(), (await this.validators.balanceOf(voter)).toString())
        assert.equal((await this.gov.proposalThreshold()).toString(), (await this.validators.balanceOf(proposer)).toString())

        // Proposer submits proposal to change treasury addresses
        this.gov.propose(
            [this.plutus.address], ['0'], ["setAgora(address)"],
            [encodeParameters(['address'], [agora])],
            'Change Agora address',
            { from: proposer },
        );
        for (let i = 0; i < 3; ++i) {
            await time.advanceBlock();
        }
        // Proposer is not able to propose until this one is resolved
        await expectRevert(
            this.gov.propose(
                [this.plutus.address], ['0'], ["setAgora(address)"],
                [encodeParameters(['address'], [agora])],
                'Change Agora address',
                { from: proposer },
            ),
            'PolisAssembly::propose: one live proposal per proposer, found an already active proposal',
        );

        await this.gov.castVote('1', true, { from: voter });
        await expectRevert(this.gov.queue('1'), "PolisAssembly::queue: proposal can only be queued if it is succeeded");
        console.log("Advancing 100 blocks...");
        // For this test to work, (temporally) modify Governance contract for a voting period of 100 blocks. This to make the test run faster.
        for (let i = 0; i < 100; ++i) {
            await time.advanceBlock();
        }
        await this.gov.queue('1');
        await expectRevert(this.gov.execute('1'), "Timelock::executeTransaction: Transaction hasn't surpassed time lock.");
        await time.increase(time.duration.days(3));
        assert.equal((await this.plutus.agora()).toString(), '0x0000000000000000000000000000000000000000');
        await this.gov.execute('1');
        assert.equal((await this.plutus.agora()).toString(), agora);

        // Move ownership of plutus to dev
        this.gov.propose(
            [this.plutus.address], ['0'], ['proposeOwner(address)'],
            [encodeParameters(['address'], [dev])],
            'Propose dev as plutus',
            { from: proposer },
        );
        for (let i = 0; i < 3; ++i) {
            await time.advanceBlock();
        }
        await this.gov.castVote('2', true, { from: voter });
        for (let i = 0; i < 100; ++i) {
            await time.advanceBlock();
        }
        await this.gov.queue('2');
        await time.increase(time.duration.days(3));
        assert.equal((await this.plutus.owner()).toString(), this.timelock.address);
        await this.gov.execute('2');
        await this.plutus.claimOwnership({from: dev});
        assert.equal((await this.plutus.owner()).toString(), dev);

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
        await this.gov.castVote('3', true, { from: voter });
        // 17280
        for (let i = 0; i < 100; ++i) {
            await time.advanceBlock();
        }
        await this.gov.queue('3');
        await time.increase(time.duration.days(3));
        // Guardian and only guardian should be able to emergency cancel a malicious proposal
        await expectRevert(this.gov.cancel('3', {from: voter}), "PolisAssembly::cancel: proposer above threshold");
        await this.gov.__changeGuardian(voter, {from: alice});
        await expectRevert(this.gov.cancel('3', {from: alice}), "PolisAssembly::cancel: proposer above threshold");
        await this.gov.cancel('3', {from: voter});

    });


    // PolisParliament controls the Treasury. It has lesser requirements for proposal and voting
    it('should allow PolisParliament to control Agora', async () => {

        // Transfer ownership of Agora to a DIFFERENT timelock contract
        this.timelockOmega = await Timelock.new(alice, time.duration.days(1), { from: alice });
        this.govOmega = await GovernorOmega.new(this.timelockOmega.address, this.validators.address, alice, { from: alice });
        await this.timelockOmega.setPendingAdmin(this.govOmega.address, { from: alice });
        await this.govOmega.__acceptAdmin({ from: alice });

        // Proposer needs at least 0.1% Validators to propose and 4% votes to pass the proposal
        // transfer 4% so votes can get quorum
        await this.plutus.depositToken('0', web3.utils.toWei('4000'), { from: voter });
        await this.plutus.depositToken('0', web3.utils.toWei('95900'), { from: alice });

        await this.validators.delegate(voter, { from: voter });
        await this.validators.delegate(proposer, { from: proposer });

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
            'PolisParliament::propose: proposer votes below proposal threshold',
        );
        // Transfer min to propose
        await this.plutus.depositToken('0', web3.utils.toWei('100'), { from: proposer });
        assert.equal((await this.govOmega.quorumVotes()).toString(), (await this.validators.balanceOf(voter)).toString())
        assert.equal((await this.govOmega.proposalThreshold()).toString(), (await this.validators.balanceOf(proposer)).toString())
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
        await expectRevert(this.govOmega.queue('1'), "PolisParliament::queue: proposal can only be queued if it is succeeded");
        console.log("Advancing 100 blocks...");
        // For this test to work, (temporally) modify Governance contract for a voting period of 100 blocks. This to make the test run faster.
        //await time.advanceBlockTo(17280);
        for (let i = 0; i < 100; ++i) {
            await time.advanceBlock();
        }
        await this.govOmega.queue('1');
        await expectRevert(this.govOmega.execute('1'), "Timelock::executeTransaction: Transaction hasn't surpassed time lock.");
        await time.increase(time.duration.days(1.1));
        await this.govOmega.execute('1');
        assert.equal((await this.polis.balanceOf(project1)).toString(), web3.utils.toWei('1000'));

        // Move ownership of agora to dev
        this.govOmega.propose(
            [this.agora.address], ['0'], ['proposeOwner(address)'],
            [encodeParameters(['address'], [dev])],
            'Propose dev as agora',
            { from: proposer },
        );
        for (let i = 0; i < 3; ++i) {
            await time.advanceBlock();
        }
        await this.govOmega.castVote('2', true, { from: voter });
        for (let i = 0; i < 100; ++i) {
            await time.advanceBlock();
        }
        await this.govOmega.queue('2');
        await time.increase(time.duration.days(1.1));
        assert.equal((await this.agora.owner()).toString(), this.timelockOmega.address);
        await this.govOmega.execute('2');
        await this.agora.claimOwnership({from: dev});
        assert.equal((await this.agora.owner()).toString(), dev);
    });

});
