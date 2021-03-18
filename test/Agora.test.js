const { expectRevert, time } = require('@openzeppelin/test-helpers');
const Polis = artifacts.require('token/Polis.sol');
const Plutus = artifacts.require('plutus/Plutus.sol');
const Validator = artifacts.require('token/Validator');
const Agora = artifacts.require('agora/Agora.sol');

contract('Agora', ([project1, dev, validators]) => {
    beforeEach(async () => {
        this.polis = await Polis.new({ from: dev });
    });

    it('should claim funds from plutus', async () => {
        // Start mining at block 40
        this.plutus = await Plutus.new(this.polis.address, validators, web3.utils.toWei('100'), '40', { from: dev });
        await this.polis.proposeOwner(this.plutus.address, { from: dev });
        await this.plutus.claimToken(this.polis.address, { from: dev });
        this.agora = await Agora.new(this.plutus.address, this.polis.address, { from: dev })
        await this.plutus.setAgora(this.agora.address, { from: dev });
        await time.advanceBlockTo('49');
        await this.agora.claimFunding();
        // 10*10 polis
        assert.equal((await this.polis.totalSupply()).toString(), web3.utils.toWei('100'));
        assert.equal((await this.agora.getTreasuryBalance()).toString(), web3.utils.toWei('100'));
    });

    it('should estimate pending funds', async () => {
        // Start mining at block 60
        this.plutus = await Plutus.new(this.polis.address, validators, web3.utils.toWei('100'), '60', { from: dev });
        await this.polis.proposeOwner(this.plutus.address, { from: dev });
        await this.plutus.claimToken(this.polis.address, { from: dev });
        this.agora = await Agora.new(this.plutus.address, this.polis.address, { from: dev })
        await this.plutus.setAgora(this.agora.address, { from: dev });
        await time.advanceBlockTo('74');
        // 14*10 polis
        assert.equal((await this.agora.pendingFunds()).toString(), web3.utils.toWei('140'));
        await this.agora.claimFunding();
        await time.advanceBlockTo('87');
        // 12*10 polis
        assert.equal((await this.agora.pendingFunds()).toString(), web3.utils.toWei('120'));
    });

    it('should send funds to addresses', async () => {
        // Start mining at block 100
        this.plutus = await Plutus.new(this.polis.address, validators, web3.utils.toWei('100'), '100', { from: dev });
        await this.polis.proposeOwner(this.plutus.address, { from: dev });
        await this.plutus.claimToken(this.polis.address, { from: dev });
        this.agora = await Agora.new(this.plutus.address, this.polis.address, { from: dev })
        await this.plutus.setAgora(this.agora.address, { from: dev });
        await time.advanceBlockTo('119');
        // 20*10 polis
        await expectRevert(this.agora.fundAddress(project1, web3.utils.toWei('210'), {from: dev}), "fundAddress: not enough funds for request")
        await this.agora.fundAddress(project1, web3.utils.toWei('210'), {from: dev});
        assert.equal((await this.polis.balanceOf(project1)).toString(), web3.utils.toWei('210'));
    });
});