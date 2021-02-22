const { expectRevert, time } = require('@openzeppelin/test-helpers');
const Polis = artifacts.require('token/Polis.sol');
const Senate = artifacts.require('senate/Senate.sol');

contract('Senate', ([tech, community, business, marketing, adoption, newAdoption, owner]) => {
    beforeEach(async () => {
        this.polis = await Polis.new({ from: owner });
    });

    it('should initialize the contract correctly', async () => {
        this.senate = await Senate.new(tech, community, business, marketing, adoption, this.polis.address, { from: owner });
        let owners = await this.senate.getManagersOwner();

        assert.equal(owners[0], tech);
        assert.equal(owners[1], community);
        assert.equal(owners[2], business);
        assert.equal(owners[3], marketing);
        assert.equal(owners[4], adoption);

        let budgets = await this.senate.getBudgetAllocation();
        assert.equal(budgets[0], "30");
        assert.equal(budgets[1], "10");
        assert.equal(budgets[2], "20");
        assert.equal(budgets[3], "20");
        assert.equal(budgets[4], "20");

        let voting = await this.senate.voting();
        assert.equal(voting, false)
        let initialized = await this.senate.initialized();
        assert.equal(initialized, false)

        let now = await time.latest();
        let currTimeNumber = parseInt(now);
        let expectedVotingTime = currTimeNumber + (365 * 24 * 60 * 60);
        let nextVoting = await this.senate.nextVotingPeriod()

        assert.equal(nextVoting.toString(), expectedVotingTime.toString())
    });

    it('should initialize the Senate contract by all members', async () => {
        this.senate = await Senate.new(tech, community, business, marketing, adoption, this.polis.address, { from: owner });
        // The contract should not be initialized when deployed
        let initialized = await this.senate.initialized();
        assert.equal(initialized, false)

        // Tech manager calls the initialization
        await this.senate.initialize({from: tech})
        initialized = await this.senate.initialized();
        assert.equal(initialized, false)

        // Tech manager try to call again the initialization and fail
        expectRevert(this.senate.initialize({from: tech}), "Senate: manager already initialized")

        // Community manager calls the initialization
        await this.senate.initialize({from: community})
        initialized = await this.senate.initialized();
        assert.equal(initialized, false)

        // Business manager calls the initialization
        await this.senate.initialize({from: business})
        initialized = await this.senate.initialized();
        assert.equal(initialized, false)

        // Marketing manager calls the initialization
        await this.senate.initialize({from: marketing})
        initialized = await this.senate.initialized();
        assert.equal(initialized, false)
        
         // Adoption manager calls the initialization
         await this.senate.initialize({from: adoption})
         initialized = await this.senate.initialized();

         // Contract should be initialized once all call the function
         assert.equal(initialized, true)
    });

    it('should modify the budget proportions by all managers voting', async () => {
        this.senate = await Senate.new(tech, community, business, marketing, adoption, this.polis.address, { from: owner });
        
        // Check the initial allocation
        let budgets = await this.senate.getBudgetAllocation();
        assert.equal(budgets[0], "30");
        assert.equal(budgets[1], "10");
        assert.equal(budgets[2], "20");
        assert.equal(budgets[3], "20");
        assert.equal(budgets[4], "20");

        // Tech manager proposes a new allocation and fails twice becuase it does not sum 100%
        let failedAllocation1 = ["40", "5", "15", "20", "30"]
        expectRevert(this.senate.proposeNewBudgetAllocation(failedAllocation1, {from: tech}), "Senate: Error trying to add a budget allocation proposal: budget should sum 100 percent")
        let failedAllocation2 = ["40", "5", "15", "20", "10"]
        expectRevert(this.senate.proposeNewBudgetAllocation(failedAllocation2, {from: tech}), "Senate: Error trying to add a budget allocation proposal: budget should sum 100 percent")

        // Tech manager proposes a new allocation
        let newAllocation1 = ["40", "5", "15", "20", "20"]
        await this.senate.proposeNewBudgetAllocation(newAllocation1, {from: tech})

        // Check the proposed budget allocation
        let newProposedAllocation1 = await this.senate.getProposedBudgetAllocation();
        assert.equal(newProposedAllocation1[0], "40");
        assert.equal(newProposedAllocation1[1], "5");
        assert.equal(newProposedAllocation1[2], "15");
        assert.equal(newProposedAllocation1[3], "20");
        assert.equal(newProposedAllocation1[4], "20");     

        // Since no one has voted yet, the proposed budget allocation can be modified

        // Tech manager proposes a second allocation to override the first one
        let newAllocation2 = ["30", "15", "15", "20", "20"]
        await this.senate.proposeNewBudgetAllocation(newAllocation2, {from: tech})

        // Check the new proposal
        let newProposedAllocation2 = await this.senate.getProposedBudgetAllocation();
        assert.equal(newProposedAllocation2[0], "30");
        assert.equal(newProposedAllocation2[1], "15");
        assert.equal(newProposedAllocation2[2], "15");
        assert.equal(newProposedAllocation2[3], "20");
        assert.equal(newProposedAllocation2[4], "20");    

        // Tech manager votes for the budget allocation with an approval
        await this.senate.voteNewBudgetAllocation(1, {from: tech});

        // Tech manager try to vote again and fails
        expectRevert(this.senate.voteNewBudgetAllocation(1, {from: tech}), "Senate: manager already voted")

        // Community manager tries to override the proposed budget allocation to the first one and fails
        expectRevert(this.senate.proposeNewBudgetAllocation(newAllocation1, {from: community}), "Senate: cannot propose a new budget allocation during a voting of a new allocation")

        // Community manager votes for the budget allocation with a rejection
        await this.senate.voteNewBudgetAllocation(0, {from: community});

        // Business manager votes for the budget allocation with a rejection
        await this.senate.voteNewBudgetAllocation(0, {from: business});

        // Marketing manager votes for the budget allocation with a rejection
        await this.senate.voteNewBudgetAllocation(0, {from: marketing});

        // Adoption manager votes for the budget allocation with an approval
        await this.senate.voteNewBudgetAllocation(1, {from: adoption});   
        
        // Since there are only 2 out of 5 votes the proposal should fail and the budget allocation should be not modified
        budgets = await this.senate.getBudgetAllocation();
        assert.equal(budgets[0], "30");
        assert.equal(budgets[1], "10");
        assert.equal(budgets[2], "20");
        assert.equal(budgets[3], "20");
        assert.equal(budgets[4], "20");

        // Proposed allocation should be empty
        let emptyProposedAllocation = await this.senate.getProposedBudgetAllocation();
        assert.equal(emptyProposedAllocation[0], "0");
        assert.equal(emptyProposedAllocation[1], "0");
        assert.equal(emptyProposedAllocation[2], "0");
        assert.equal(emptyProposedAllocation[3], "0");
        assert.equal(emptyProposedAllocation[4], "0");        

        // Tech manager proposes the initial modification
        await this.senate.proposeNewBudgetAllocation(newAllocation1, {from: tech})

        // Check the proposed budget allocation
        let proposed = await this.senate.getProposedBudgetAllocation();
        assert.equal(proposed[0], "40");
        assert.equal(proposed[1], "5");
        assert.equal(proposed[2], "15");
        assert.equal(proposed[3], "20");
        assert.equal(proposed[4], "20");     

        // All managers approve the allocation
        await this.senate.voteNewBudgetAllocation(1, {from: tech});
        await this.senate.voteNewBudgetAllocation(1, {from: community});
        await this.senate.voteNewBudgetAllocation(1, {from: business});
        await this.senate.voteNewBudgetAllocation(1, {from: marketing});
        await this.senate.voteNewBudgetAllocation(1, {from: adoption});

        // Budget allocation should be properly modified

        let newFinalAllocation = await this.senate.getBudgetAllocation();
        assert.equal(newFinalAllocation[0], "40");
        assert.equal(newFinalAllocation[1], "5");
        assert.equal(newFinalAllocation[2], "15");
        assert.equal(newFinalAllocation[3], "20");
        assert.equal(newFinalAllocation[4], "20");
    });

    it('should enable managers to extract their budget proportions', async () => {
        this.senate = await Senate.new(tech, community, business, marketing, adoption, this.polis.address, { from: owner });

        // Mint some tokens for the senate contract.
        await this.polis.mint(this.senate.address, "100000000000000000000", {from: owner})

        let senateBalance = await this.polis.balanceOf(this.senate.address)
        assert.equal(senateBalance, "100000000000000000000")

        // Check manager balances to make sure they don't have balance at the begining.
        let initialTechBalance = await this.polis.balanceOf(tech);
        assert.equal(initialTechBalance, "0")
        let initialCommunityBalance = await this.polis.balanceOf(community);
        assert.equal(initialCommunityBalance, "0")
        let initialBusinessBalance = await this.polis.balanceOf(business);
        assert.equal(initialBusinessBalance, "0")
        let initialMarketingBalance = await this.polis.balanceOf(marketing);
        assert.equal(initialMarketingBalance, "0")
        let initialAdoptionBalance = await this.polis.balanceOf(adoption);
        assert.equal(initialAdoptionBalance, "0")
        
        // Tech manager tries to claim the budget without the contract being inialized.
        expectRevert(this.senate.claimBudget({from: tech}), "Senate: contract is not initialized yet")

        // Managers initialize the contract
        await this.senate.initialize({from: tech})
        await this.senate.initialize({from: community})
        await this.senate.initialize({from: business})
        await this.senate.initialize({from: marketing})
        await this.senate.initialize({from: adoption})

        // Managers claim the budget
        await this.senate.claimBudget({from: tech})
        await this.senate.claimBudget({from: community})
        await this.senate.claimBudget({from: business})
        await this.senate.claimBudget({from: marketing})
        await this.senate.claimBudget({from: adoption})

        let techBalance = await this.polis.balanceOf(tech);
        assert.equal(techBalance, "30000000000000000000")
        let communityBalance = await this.polis.balanceOf(community);
        assert.equal(communityBalance, "10000000000000000000")
        let businessBalance = await this.polis.balanceOf(business);
        assert.equal(businessBalance, "20000000000000000000")
        let marketingBalance = await this.polis.balanceOf(marketing);
        assert.equal(marketingBalance, "20000000000000000000")
        let adoptionBalance = await this.polis.balanceOf(adoption);
        assert.equal(adoptionBalance, "20000000000000000000")

        senateBalance = await this.polis.balanceOf(this.senate.address);
        assert.equal(senateBalance, "0")

    });

    it('should replace the adoption manager by a full Senate approval', async () => {
        this.senate = await Senate.new(tech, community, business, marketing, adoption, this.polis.address, { from: owner });

        // Check initial manager
        let owners = await this.senate.getManagersOwner();

        assert.equal(owners[0], tech);
        assert.equal(owners[1], community);
        assert.equal(owners[2], business);
        assert.equal(owners[3], marketing);
        assert.equal(owners[4], adoption);
        
        // Tech manager proposes the replacement of the adoption manager
        await this.senate.proposeManagementReplace(await this.senate.ADOPTION_INDEX(), newAdoption)

        // Tech manager approves the replacement of the adoption manager 
        await this.senate.voteManagementReplacement(1, {from: tech})

        // Tech manager tires to override the manager to be replaced and fail
        expectRevert(this.senate.proposeManagementReplace(await this.senate.TECH_INDEX(), newAdoption), "Senate: cannot propose a manager replacement during the voting of a managemer replacement")

        // Other managers approve the replacement
        await this.senate.voteManagementReplacement(1, {from: community})
        await this.senate.voteManagementReplacement(1, {from: business})
        await this.senate.voteManagementReplacement(1, {from: marketing})
        await this.senate.voteManagementReplacement(1, {from: adoption})

        // Make sure managers are properly modified

        owners = await this.senate.getManagersOwner();

        assert.equal(owners[0], tech);
        assert.equal(owners[1], community);
        assert.equal(owners[2], business);
        assert.equal(owners[3], marketing);
        assert.equal(owners[4], newAdoption);

        // Contract should be de-initialized and wait for manager to reinitialize it
        let initialized = await this.senate.initialized();
        assert.equal(initialized, false)

        // Managers initialize the contract
        await this.senate.initialize({from: tech})
        await this.senate.initialize({from: community})
        await this.senate.initialize({from: business})
        await this.senate.initialize({from: marketing})
        await this.senate.initialize({from: newAdoption})

        initialized = await this.senate.initialized();
        assert.equal(initialized, true)
    });

});