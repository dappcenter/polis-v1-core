const { expectRevert, time } = require('@openzeppelin/test-helpers');
const Polis = artifacts.require('token/Polis.sol');
const Plutus = artifacts.require('plutus/Plutus.sol');
const MockERC20 = artifacts.require('token/MockToken.sol');
const Validator = artifacts.require('token/Validator');


contract('Plutus', ([alice, bob, carol, dev, senate, agora, minter]) => {
    beforeEach(async () => {
        this.polis = await Polis.new({ from: dev });
        this.validators = await Validator.new({ from: dev });
    });

    it('should set correct state variables', async () => {
        this.plutus = await Plutus.new(this.polis.address, this.validators.address, web3.utils.toWei('1000'), '0', { from: dev });
        await this.polis.proposeOwner(this.plutus.address, { from: dev });
        await this.plutus.claimToken(this.polis.address, { from: dev });
        await this.validators.proposeOwner(this.plutus.address, { from: dev });
        await this.plutus.claimToken(this.validators.address, { from: dev });
        const polis = await this.plutus.polis();
        const drachmaCost = await this.plutus.DRACHMA_AMOUNT();
        const owner = await this.plutus.owner();
        const rewardL = await this.plutus.getRewardsLength();
        assert.equal(polis.toString(), this.polis.address);
        assert.equal(drachmaCost.toString(), web3.utils.toWei('100'));
        assert.equal(owner.toString(), dev);
        assert.equal(rewardL.toString(), '1');

    });

    context('With Polis being used to set drachmas', () => {
        beforeEach(async () => {
            await this.polis.mint(alice, web3.utils.toWei('1000'), { from: dev });
            await this.polis.mint(bob, web3.utils.toWei('1000'), { from: dev });
            await this.polis.mint(carol, web3.utils.toWei('1000'), { from: dev });
        });

         it('should allow emergency withdraw', async () => {
            // 100 per block mining rate starting at block 50
            this.plutus = await Plutus.new(this.polis.address, this.validators.address, web3.utils.toWei('100'), '50',{ from: dev });
            await this.polis.proposeOwner(this.plutus.address, { from: dev });
            await this.plutus.claimToken(this.polis.address, { from: dev });
            await this.validators.proposeOwner(this.plutus.address, { from: dev });
            await this.plutus.claimToken(this.validators.address, { from: dev });
            await this.polis.approve(this.plutus.address, web3.utils.toWei('1000'), { from: bob });
            await this.plutus.depositToken('0', web3.utils.toWei('500'), { from: bob });
            assert.equal((await this.polis.balanceOf(bob)).toString(), web3.utils.toWei('500'));
            await this.plutus.emergencyWithdraw('0', { from: bob });
            assert.equal((await this.polis.balanceOf(bob)).toString(), web3.utils.toWei('1000'));
        });

        it('should give out POLIS only after farming time', async () => {
            // 100 per block mining rate starting at block 100
            this.plutus = await Plutus.new(this.polis.address, this.validators.address, web3.utils.toWei('100'), '100', { from: dev });
            await this.polis.proposeOwner(this.plutus.address, { from: dev });
            await this.plutus.claimToken(this.polis.address, { from: dev });
            await this.validators.proposeOwner(this.plutus.address, { from: dev });
            await this.plutus.claimToken(this.validators.address, { from: dev });
            await this.polis.approve(this.plutus.address, web3.utils.toWei('1000'), { from: bob });
            // Bob starts with 1000 polis, deposits 100 for a drachma
            await this.plutus.depositToken('0', web3.utils.toWei('100'), { from: bob });
            await time.advanceBlockTo('89');
            await this.plutus.depositToken('0', '0', { from: bob }); // block 90
            assert.equal((await this.polis.balanceOf(bob)).toString(), web3.utils.toWei('900'));
            await time.advanceBlockTo('94');
            await this.plutus.depositToken('0', '0', { from: bob }); // block 95
            assert.equal((await this.polis.balanceOf(bob)).toString(), web3.utils.toWei('900'));
            await time.advanceBlockTo('99');
            await this.plutus.depositToken('0', '0', { from: bob }); // block 100
            assert.equal((await this.polis.balanceOf(bob)).toString(), web3.utils.toWei('900'));
            await time.advanceBlockTo('100');
            await this.plutus.depositToken('0', '0', { from: bob }); // block 101
            assert.equal((await this.polis.balanceOf(bob)).toString(), web3.utils.toWei('970'));
            await time.advanceBlockTo('104');
            await this.plutus.depositToken('0', '0', { from: bob }); // block 105
            assert.equal((await this.polis.balanceOf(bob)).toString(), web3.utils.toWei('1250'));
            assert.equal((await this.polis.totalSupply()).toString(), web3.utils.toWei('3350'));
        });

        it('should not distribute POLIS if no one deposit', async () => {
            // 100 per block mining rate starting at block 200
            this.plutus = await Plutus.new(this.polis.address, this.validators.address, web3.utils.toWei('100'), '200',{ from: dev });
            await this.polis.proposeOwner(this.plutus.address, { from: dev });
            await this.plutus.claimToken(this.polis.address, { from: dev });
            await this.validators.proposeOwner(this.plutus.address, { from: dev });
            await this.plutus.claimToken(this.validators.address, { from: dev });
            await this.polis.approve(this.plutus.address, web3.utils.toWei('1000'), { from: bob });
            await time.advanceBlockTo('199');
            assert.equal((await this.polis.totalSupply()).toString(), web3.utils.toWei('3000'));
            await time.advanceBlockTo('204');
            assert.equal((await this.polis.totalSupply()).toString(), web3.utils.toWei('3000'));
            await time.advanceBlockTo('209');
            await this.plutus.depositToken('0', web3.utils.toWei('100'), { from: bob });
            assert.equal((await this.polis.totalSupply()).toString(), web3.utils.toWei('3000'));
            assert.equal((await this.polis.balanceOf(bob)).toString(), web3.utils.toWei('900'));
            assert.equal((await this.polis.balanceOf(this.plutus.address)).toString(), web3.utils.toWei('100'));
            await time.advanceBlockTo('219');
            await this.plutus.withdrawToken('0', web3.utils.toWei('100'), { from: bob });
            assert.equal((await this.polis.totalSupply()).toString(), web3.utils.toWei('3700'));
            assert.equal((await this.polis.balanceOf(bob)).toString(), web3.utils.toWei('1700'));
            assert.equal((await this.polis.balanceOf(this.plutus.address)).toString(), '0');
        });


        it('should distribute POLIS properly for each drachma', async () => {
            // 100 per block mining rate starting at block 300
            this.plutus = await Plutus.new(this.polis.address, this.validators.address, web3.utils.toWei('100'), '200',{ from: dev });
            await this.polis.proposeOwner(this.plutus.address, { from: dev });
            await this.plutus.claimToken(this.polis.address, { from: dev });
            await this.validators.proposeOwner(this.plutus.address, { from: dev });
            await this.plutus.claimToken(this.validators.address, { from: dev });
            await this.polis.approve(this.plutus.address, web3.utils.toWei('1000'), { from: alice });
            await this.polis.approve(this.plutus.address, web3.utils.toWei('1000'), { from: carol });
            await this.polis.approve(this.plutus.address, web3.utils.toWei('1000'), { from: bob });
            // Alice adds 1 drachma at block 310
            await time.advanceBlockTo('309');
            await this.plutus.depositToken('0', web3.utils.toWei('100'), { from: alice });
            // Bob adds 2 drachmas at block 314
            await time.advanceBlockTo('313');
            await this.plutus.depositToken('0', web3.utils.toWei('200'), { from: bob });
            // Carol adds 3 drachmas at block 318
            await time.advanceBlockTo('317');
            await this.plutus.depositToken('0', web3.utils.toWei('300'), { from: carol });
            // Alice adds 1 more drachma at block 320. At this point:
            //   Alice should have: 4*70 + 4*1/3*70 + 2*1/6*70 = 396.6666666666 (+ her remainig 800)
            //   Plutus should have the remaining: 700 - 566 = 303.3333333334
            await time.advanceBlockTo('319')
            await this.plutus.depositToken('0', web3.utils.toWei('100'), { from: alice });
            assert.equal((await this.polis.totalSupply()).toString(), web3.utils.toWei('3700'));
            assert.equal((await this.polis.balanceOf(alice)).toString(), web3.utils.toWei('1196.6666666666'));
            assert.equal((await this.polis.balanceOf(bob)).toString(), web3.utils.toWei('800'));
            assert.equal((await this.polis.balanceOf(carol)).toString(), web3.utils.toWei('700'));
            assert.equal((await this.polis.balanceOf(this.plutus.address)).toString(), web3.utils.toWei('1003.3333333334'));
            // Bob cannot exit with custom amounts
            await expectRevert(this.plutus.withdrawToken('0', web3.utils.toWei('50'), { from: bob }), 'withdrawToken: incorrect DRACHMA amount');
            // Bob removes 1 drachma at block 330. At this point:
            //   Bob should have: 4*2/3*70 + 2*2/6*70 + 10*2/7*70 = 433.3333333333 (+ 800)
            await time.advanceBlockTo('329')
            await this.plutus.withdrawToken('0', web3.utils.toWei('100'), { from: bob });
            assert.equal((await this.polis.totalSupply()).toString(), web3.utils.toWei('4400'));
            assert.equal((await this.polis.balanceOf(alice)).toString(), web3.utils.toWei('1196.6666666666'));
            assert.equal((await this.polis.balanceOf(bob)).toString(), web3.utils.toWei('1333.3333333332'));
            assert.equal((await this.polis.balanceOf(carol)).toString(), web3.utils.toWei('700'));
            assert.equal((await this.polis.balanceOf(this.plutus.address)).toString(), web3.utils.toWei('1170.0000000002'));
            // Alice exits 2 drachmas at block 340.
            // Bob exits 1 drachma at block 350.
            // Carol exits 3 drachmas at block 360.
            await time.advanceBlockTo('339')
            await this.plutus.withdrawToken('0', web3.utils.toWei('200'), { from: alice });
            await time.advanceBlockTo('349')
            await this.plutus.withdrawToken('0', web3.utils.toWei('100'), { from: bob });
            await time.advanceBlockTo('359')
            await this.plutus.withdrawToken('0', web3.utils.toWei('300'), { from: carol });
            assert.equal((await this.polis.totalSupply()).toString(), web3.utils.toWei('6500'));
            // Alice should have: 396.6666666666 + 10*2/7*70 + 10*2/6*70 = 829.9999999998 (+1000)
            assert.equal((await this.polis.balanceOf(alice)).toString(), web3.utils.toWei('1829.9999999998'));
            // Bob should have: 433.3333333333 + 10*1/6 * 70 + 10*1/4*70 = 724.99999999998 (+1000)
            assert.equal((await this.polis.balanceOf(bob)).toString(), web3.utils.toWei('1724.9999999998'));
            // Carol should have: 2*3/6*70 + 10*3/7*70 + 10*3/6*70 + 10*3/4*70 + 10*70 = 1945 (+1000)
            assert.equal((await this.polis.balanceOf(carol)).toString(), web3.utils.toWei('2944.9999999996'));
            // Plutus keeps the decimal rest for now
            assert.equal((await this.polis.balanceOf(this.plutus.address)).toString(), web3.utils.toWei('0.0000000008'));

        });

        it('should distribute POLIS between treasuries and drachmas', async () => {
            // Treasury's default distribution is 70% drachmas, 20% DAO and 10% commuinity
            // 100 per block mining rate starting at block 400
            this.plutus = await Plutus.new(this.polis.address, this.validators.address, web3.utils.toWei('100'), '400',{ from: dev });
            await this.polis.proposeOwner(this.plutus.address, { from: dev });
            await this.plutus.claimToken(this.polis.address, { from: dev });
            await this.validators.proposeOwner(this.plutus.address, { from: dev });
            await this.plutus.claimToken(this.validators.address, { from: dev });
            await this.polis.approve(this.plutus.address, web3.utils.toWei('1000'), { from: alice });
            await this.polis.approve(this.plutus.address, web3.utils.toWei('1000'), { from: bob });
            // Set the treasury addresses
            await this.plutus.setSenate(senate, { from: dev });
            await this.plutus.setAgora(agora, { from: dev });
            // Alice adds 1 drachma at block 410
            await time.advanceBlockTo('409');
            await this.plutus.depositToken('0', web3.utils.toWei('100'), { from: alice });
            // Senate claims rewards at block 420
            await time.advanceBlockTo('419');
            await this.plutus.claimTreasury('0');
            // Alice should have 10*70 pending reward
            assert.equal((await this.plutus.pendingPolis('0', alice)).toString(), web3.utils.toWei('700'));
            // Senate (DAO) should have 20*20
            assert.equal((await this.polis.balanceOf(senate)).toString(), web3.utils.toWei('400'));
            // Bob deposits 1 drachma at block 425
            await time.advanceBlockTo('424');
            await this.plutus.depositToken('0', web3.utils.toWei('100'), { from: bob });
            // Alice should have 700 + 570 = 1050 pending reward
            assert.equal((await this.plutus.pendingPolis('0', alice)).toString(), web3.utils.toWei('1050'));
            await time.advanceBlockTo('429');
            // Agora (community) claims rewards at block 430. It should have 30*10
            await this.plutus.claimTreasury('1');
            assert.equal((await this.polis.balanceOf(agora)).toString(), web3.utils.toWei('300'));
            // Bob should have pending 5*1/2*70 = 175 pending. Alice should have 1050 +  5*1/2*70 = 1225
            assert.equal((await this.plutus.pendingPolis('0', alice)).toString(), web3.utils.toWei('1225'));
            assert.equal((await this.plutus.pendingPolis('0', bob)).toString(), web3.utils.toWei('175'));
            // Senate claims also. Now it should have 31*20
            await this.plutus.claimTreasury('0');
            assert.equal((await this.polis.balanceOf(senate)).toString(), web3.utils.toWei('620'));
            await time.advanceBlockTo('439');
            // Governance changes the alloc of DAO to 5 and alloc of Community to 20 at block 440 and 441 respectively
            await this.plutus.setPercentage('0', '5', true, {from:dev});
            await this.plutus.setPercentage('1', '20', true, {from:dev});
            // At block 450, treasury 1 claims rewards
            await time.advanceBlockTo('449');
            // 40*20 + 1*100*5/85 + 9*100*5/95 = 853.250773993808049535
            await this.plutus.claimTreasury('0');
            assert.equal((await this.polis.balanceOf(senate)).toString(), web3.utils.toWei('853.250773993808049535'));
            // Treasury 2 at block 451
            // 40*10 + 1*100*10/85 + 10*100*20/95 = 622.291021671826625386
            await this.plutus.claimTreasury('1');
            assert.equal((await this.polis.balanceOf(agora)).toString(), web3.utils.toWei('622.291021671826625386'));
            // At this point, Alice can claim 1225 + 10*1/2*70 + 1*1/2*100*70/85 + 10*1/2*100*70/95 = 1984.5975232197
            assert.equal((await this.plutus.pendingPolis('0', alice)).toString(), web3.utils.toWei('1984.5975232197'));
        });
        it('should halve the POLIS emission each year', async () => {
            // 100 per block mining rate starting at block 300
            this.plutus = await Plutus.new(this.polis.address, this.validators.address, web3.utils.toWei('100'), '500',{ from: dev });
            await this.polis.proposeOwner(this.plutus.address, { from: dev });
            await this.plutus.claimToken(this.polis.address, { from: dev });
            await this.validators.proposeOwner(this.plutus.address, { from: dev });
            await this.plutus.claimToken(this.validators.address, { from: dev });
            await this.polis.approve(this.plutus.address, web3.utils.toWei('1000'), { from: alice });
            // Alice adds 1 drachma at block 500
            await time.advanceBlockTo('499');
            await this.plutus.depositToken('0', web3.utils.toWei('100'), { from: alice });
            await time.advanceBlockTo('504');
            // Advance a year in time
            await time.increase(365*86400);
            await time.advanceBlockTo('509');
            // At 510 alice claims 10*70 (+900)
            await this.plutus.depositToken('0', web3.utils.toWei('0'), { from: alice });
            assert.equal((await this.polis.balanceOf(alice)).toString(), web3.utils.toWei('1600'));
            // Halving is called
            await this.plutus.halving();
            await time.advanceBlockTo('519');
            // At 520 alice claims 10*70 + 1*70 + 9*80*70/100 = 1274 (+900)
            await this.plutus.depositToken('0', web3.utils.toWei('0'), { from: alice });
            assert.equal((await this.polis.balanceOf(alice)).toString(), web3.utils.toWei('2174'));
            await time.increase(365*86400);
            await time.advanceBlockTo('524');
            await this.plutus.halving();
            await time.advanceBlockTo('529');
            // At 530 alice claims 1274 + 5*80*70/100 + 5*64*70/100 = 1778 (+900)
            await this.plutus.depositToken('0', web3.utils.toWei('0'), { from: alice });
            assert.equal((await this.polis.balanceOf(alice)).toString(), web3.utils.toWei('2678'));
            // Asserting final halved polisPerBlock
            assert.equal((await this.plutus.polisPerBlock()).toString(), web3.utils.toWei('64'));
        });

        it('should distribute POLIS properly for each reward token', async () => {
            // Create some different tokens
            this.polisBnbLP = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
            //await this.polisBnbLP.transfer(alice, '1000', { from: minter });
            await this.polisBnbLP.transfer(bob, '1000', { from: minter });
            //await this.polisBnbLP.transfer(carol, '1000', { from: minter });
            this.indexFund = await MockERC20.new('LPToken2', 'LP2', '10000000000', { from: minter });
            //await this.indexFund.transfer(alice, '1000', { from: minter });
            //await this.indexFund.transfer(bob, '1000', { from: minter });
            await this.indexFund.transfer(carol, '1000', { from: minter });
            // 100 per block farming rate starting at block 600
            this.plutus = await Plutus.new(this.polis.address, this.validators.address, web3.utils.toWei('100'), '600',{ from: dev });
            await this.polis.proposeOwner(this.plutus.address, { from: dev });
            await this.plutus.claimToken(this.polis.address, { from: dev });
            await this.validators.proposeOwner(this.plutus.address, { from: dev });
            await this.plutus.claimToken(this.validators.address, { from: dev });
            await this.polis.approve(this.plutus.address, web3.utils.toWei('1000'), { from: alice });
            await this.polisBnbLP.approve(this.plutus.address, '1000', { from: bob });
            await this.indexFund.approve(this.plutus.address, '1000', { from: carol });
            // Set the treasury addresses
            await this.plutus.setSenate(senate, { from: dev });
            await this.plutus.setAgora(agora, { from: dev });
            // Alice deposits for POLIS drachmas
            await time.advanceBlockTo('599');
            await this.plutus.depositToken('0', web3.utils.toWei('100'), { from: alice });
            // Add the POLIS-BNB token at block 610, with same allocation as DRACHMAS
            await time.advanceBlockTo('609');
            await this.plutus.addReward('70', this.polisBnbLP.address,{ from: dev });
            // Bob deposits at block 625
            await time.advanceBlockTo('624');
            await this.plutus.depositToken('1', '100', { from: bob });
            // Add IndexFund token at block 630
            await time.advanceBlockTo('629');
            await this.plutus.addReward('70', this.indexFund.address,{ from: dev });
            // Carol deposits Index al block 635
            await time.advanceBlockTo('634');
            await this.plutus.depositToken('2', '100', { from: carol });
            // Claim Senate at 639 and Agora at 640
            await time.advanceBlockTo('638');
            await this.plutus.claimTreasury('0');
            await this.plutus.claimTreasury('1');
            // At this point, Alice should have 10*100*70/100 + 20*100*70/170 + 10*100*70/240 = 1,815.1960784313 pending
            assert.equal((await this.plutus.pendingPolis('0', alice)).toString(), web3.utils.toWei('1815.1960784313'));
            // Bob has pending 5*100*70/170 + 10*100*70/240  = 497.549019607843137254
            assert.equal((await this.plutus.pendingPolis('1', bob)).toString(), web3.utils.toWei('497.549019607843137254'));
            // Carol has pending 5*100*70/240 = 145.833333333333333333
            assert.equal((await this.plutus.pendingPolis('2', carol)).toString(), web3.utils.toWei('145.833333333333333333'));
            // Senate should have 10*100*20/100 + 20*100*20/170 + 9*100*20/240 = 510.294117647058823529
            assert.equal((await this.polis.balanceOf(senate)).toString(), web3.utils.toWei('510.294117647058823529'));
            // Agora should have 10*100*10/100 + 20*100*10/170 + 10*100*10/240 = 259.31372549019607843
            assert.equal((await this.polis.balanceOf(agora)).toString(), web3.utils.toWei('259.31372549019607843'));
        });
    });
});