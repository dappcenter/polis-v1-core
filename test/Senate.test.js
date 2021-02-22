const { expectRevert, time } = require('@openzeppelin/test-helpers');
const Polis = artifacts.require('token/Polis.sol');
const Senate = artifacts.require('senate/Senate.sol');

contract('Senate', ([tech, community, business, marketing, adoption, newAdoption, communityMembers, owner]) => {
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

    it('should replace the adoption manager by a partial Senate approval and community vote', async () => {
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
        await this.senate.voteManagementReplacement(0, {from: marketing})
        await this.senate.voteManagementReplacement(0, {from: adoption})

        // Make sure owners are not changed
        owners = await this.senate.getManagersOwner();

        assert.equal(owners[0], tech);
        assert.equal(owners[1], community);
        assert.equal(owners[2], business);
        assert.equal(owners[3], marketing);
        assert.equal(owners[4], adoption);

        // Right now the replacement is partially done, contract has a grace period of 7 days for community vote

        // Try to execute the replacement before the time passes
        expectRevert(this.senate.executeReplacementVote(), "Senate: there is still time to vote before the replacement")

        // Get some coins for the "communityMembers"
        this.polis.mint(communityMembers, "1000000000000000000000", {from: owner})

        // Approve spending of the communityMember tokens by the contract
        await this.polis.approve(this.senate.address, "10000000000000000000000000000000", {from: communityMembers})

        // Check balances
        let communityBalance = await this.polis.balanceOf(communityMembers)
        assert.equal(communityBalance, "1000000000000000000000")

        // Lock the coins
        await this.senate.submitApprovalForVoteReplacement("1000000000000000000000", {from: communityMembers})
     
        // Check balances
        communityBalance = await this.polis.balanceOf(communityMembers)
        assert.equal(communityBalance, "0")

        // Check locked coins inside the contract
        let locked = await this.senate.replacementVotesTotalLocked()
        assert.equal(locked, "1000000000000000000000")

        // Unlock coins to make sure locking mechanisms works
        await this.senate.withdrawTokensForReplacementVote({from: communityMembers})

        // Check communityMembers balances
        communityBalance = await this.polis.balanceOf(communityMembers)
        assert.equal(communityBalance, "1000000000000000000000")

        // Make sure locked coins changes when community withdraws the coins
        locked = await this.senate.replacementVotesTotalLocked()
        assert.equal(locked, "0")

        // Lock coins to submit the vote
        await this.senate.submitApprovalForVoteReplacement("1000000000000000000000", {from: communityMembers})

        // Move time to the vote ending time
        let voteIntializationTime = await this.senate.communityReplacementVoteInitialTime()
        let voteEndingTime = parseInt(voteIntializationTime) + (7 * 24 * 60 * 60) + 1;

        await time.increaseTo(voteEndingTime)

        // Submit replacement
        await this.senate.executeReplacementVote()

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

    it('should start a voting period with single candidates', async () => {
        this.senate = await Senate.new(tech, community, business, marketing, adoption, this.polis.address, { from: owner });

        // Check initial manager
        let owners = await this.senate.getManagersOwner();

        assert.equal(owners[0], tech);
        assert.equal(owners[1], community);
        assert.equal(owners[2], business);
        assert.equal(owners[3], marketing);
        assert.equal(owners[4], adoption);

        let initialized = await this.senate.initialized();
        assert.equal(initialized, false)

        // Managers initialize the contract
        await this.senate.initialize({from: tech})
        await this.senate.initialize({from: community})
        await this.senate.initialize({from: business})
        await this.senate.initialize({from: marketing})
        await this.senate.initialize({from: adoption})

        initialized = await this.senate.initialized();
        assert.equal(initialized, true)

        let voting = await this.senate.voting();
        assert.equal(voting, false)

        // Try to initialize a voting period outside of time
        expectRevert(this.senate.initializeVotingCycle(), "Senate: cannot initialize a voting period before the cycle ends")
    
        // Try to submit a candidate outside of voting period
        expectRevert(this.senate.submitCandidate(0, "proposal_text", {from: tech}), "Senate: the Senate is not on voting phase")

        // Advance time to next voting period
        let nextVotingPeriod = await this.senate.nextVotingPeriod();
        let nextVotingPeriodTime = parseInt(nextVotingPeriod) + 1;
        await time.increaseTo(nextVotingPeriodTime)

        // Initialize new voting period
        await this.senate.initializeVotingCycle()

        // Voting should be enabled
        voting = await this.senate.voting();
        assert.equal(voting, true)

        // Initialization should be disabled
        initialized = await this.senate.initialized();
        assert.equal(initialized, false)

        // Managers should be removed
        owners = await this.senate.getManagersOwner();

        assert.equal(owners[0], "0x0000000000000000000000000000000000000000");
        assert.equal(owners[1], "0x0000000000000000000000000000000000000000");
        assert.equal(owners[2], "0x0000000000000000000000000000000000000000");
        assert.equal(owners[3], "0x0000000000000000000000000000000000000000");
        assert.equal(owners[4], "0x0000000000000000000000000000000000000000");

        // Try to finalize the voting without the grace period
        expectRevert(this.senate.finalizeVotingPeriod(), "Senate: unable to finish voting period, there is still time to vote")

        // Increase time to period ending
        await time.increase((14 * 24 * 60 * 60) + 1)

        // Try to finalize the voting without a tech candidate
        expectRevert(this.senate.finalizeVotingPeriod(), "Senate: Unable to close vote, there is no tech candidate")

        // Submit tech candidate
        await this.senate.submitCandidate(0, "proposal_tech", {from: tech})

        // Try to submit the same candidate to another position
        expectRevert(this.senate.submitCandidate(1, "proposal_tech", {from: tech}), "Senate: unable to upload same candidate twice")

        // Try to finalize the voting without a community candidate
        expectRevert(this.senate.finalizeVotingPeriod(), "Senate: Unable to close vote, there is no community candidate")
        
        // Submit community candidate
        await this.senate.submitCandidate(1, "proposal_community", {from: community})

        // Try to finalize the voting without a business candidate
        expectRevert(this.senate.finalizeVotingPeriod(), "Senate: Unable to close vote, there is no business candidate")

        // Submit business candidate
        await this.senate.submitCandidate(2, "proposal_business", {from: business})

        // Try to finalize the voting without a marketing candidate
        expectRevert(this.senate.finalizeVotingPeriod(), "Senate: Unable to close vote, there is no marketing candidate")

        // Submit marketing candidate
        await this.senate.submitCandidate(3, "proposal_marketing", {from: marketing})

        // Try to finalize the voting without an adoption candidate
        expectRevert(this.senate.finalizeVotingPeriod(), "Senate: Unable to close vote, there is no adoption candidate")

        // Submit adoption candidate
        await this.senate.submitCandidate(4, "proposal_adoption", {from: adoption})

    });

});