import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { YapBayEscrow, ERC20Mock } from "../typechain";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("YapBayEscrow Balance Functionality", function () {
  let escrow: YapBayEscrow;
  let usdc: ERC20Mock;
  
  let deployer: SignerWithAddress;
  let seller: SignerWithAddress;
  let buyer: SignerWithAddress;
  let arbitrator: SignerWithAddress;
  let otherUser: SignerWithAddress;
  
  // Constants
  const TRADE_ID = 1001;
  const ESCROW_AMOUNT = ethers.parseUnits("50", 6); // 50 USDC
  const MAX_AMOUNT = ethers.parseUnits("100", 6); // 100 USDC
  const DEPOSIT_DURATION = 15 * 60; // 15 minutes in seconds
  const FIAT_DURATION = 30 * 60; // 30 minutes in seconds
  const DISPUTE_RESPONSE_DURATION = 72 * 3600; // 72 hours in seconds
  const ARBITRATION_DURATION = 168 * 3600; // 168 hours (7 days) in seconds
  
  beforeEach(async () => {
    [deployer, seller, buyer, arbitrator, otherUser] = await ethers.getSigners();
    
    // Deploy mock USDC
    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    usdc = await upgrades.deployProxy(
      ERC20MockFactory, 
      ["USDC", "USDC", ethers.parseUnits("10000", 6)], 
      { kind: 'uups' }
    ) as unknown as ERC20Mock;
    
    // Deploy YapBayEscrow
    const YapBayEscrowFactory = await ethers.getContractFactory("YapBayEscrow");
    escrow = await upgrades.deployProxy(
      YapBayEscrowFactory,
      [await usdc.getAddress(), arbitrator.address],
      { kind: 'uups', initializer: 'initialize' }
    ) as unknown as YapBayEscrow;
    
    // Mint USDC to seller and buyer for testing
    await usdc.mint(seller.address, ethers.parseUnits("1000", 6));
    await usdc.mint(buyer.address, ethers.parseUnits("1000", 6));
    
    // Approve escrow contract to spend USDC
    await usdc.connect(seller).approve(await escrow.getAddress(), ethers.parseUnits("1000", 6));
    await usdc.connect(buyer).approve(await escrow.getAddress(), ethers.parseUnits("1000", 6));
  });

  describe("Balance Tracking", function () {
    let escrowId: number;
    
    beforeEach(async () => {
      // Create and fund an escrow
      await escrow.connect(seller).createEscrow(
        TRADE_ID,
        buyer.address,
        ESCROW_AMOUNT,
        false,
        ethers.ZeroAddress
      );
      escrowId = 1;
      await escrow.connect(seller).fundEscrow(escrowId);
    });
    
    it("Should track balance correctly when escrow is funded", async () => {
      // Check that the stored balance matches the escrow amount
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      expect(await escrowContract.getStoredEscrowBalance(escrowId)).to.equal(ESCROW_AMOUNT);
    });
    
    it("Should update balance to zero when escrow is released", async () => {
      // Mark fiat as paid
      await escrow.connect(buyer).markFiatPaid(escrowId);
      
      // Release the escrow
      await escrow.connect(seller).releaseEscrow(escrowId);
      
      // Check balance is zero
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      expect(await escrowContract.getStoredEscrowBalance(escrowId)).to.equal(0);
    });
    
    it("Should update balance to zero when escrow is cancelled", async () => {
      // Advance time past fiat deadline
      await time.increase(FIAT_DURATION + 1);
      
      // Cancel the escrow
      await escrow.connect(seller).cancelEscrow(escrowId);
      
      // Check balance is zero
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      expect(await escrowContract.getStoredEscrowBalance(escrowId)).to.equal(0);
    });

    it("Should emit EscrowBalanceChanged event when escrow is funded", async () => {
      // Create a new escrow
      await escrow.connect(seller).createEscrow(
        TRADE_ID + 1,
        buyer.address,
        ESCROW_AMOUNT,
        false,
        ethers.ZeroAddress
      );
      const newEscrowId = 2;
      
      // Fund the escrow and check for the event
      const tx = await escrow.connect(seller).fundEscrow(newEscrowId);
      
      await expect(tx)
        .to.emit(escrow, "EscrowBalanceChanged")
        .withArgs(
          newEscrowId,
          ESCROW_AMOUNT,
          "Escrow funded"
        );
    });

    it("Should emit EscrowBalanceChanged event when escrow is released", async () => {
      // Mark fiat as paid
      await escrow.connect(buyer).markFiatPaid(escrowId);
      
      // Release the escrow and check for the event
      const tx = await escrow.connect(seller).releaseEscrow(escrowId);
      
      await expect(tx)
        .to.emit(escrow, "EscrowBalanceChanged")
        .withArgs(
          escrowId,
          0,
          "Escrow released"
        );
    });

    it("Should emit EscrowBalanceChanged event when escrow is cancelled", async () => {
      // Advance time past fiat deadline
      await time.increase(FIAT_DURATION + 1);
      
      // Cancel the escrow and check for the event
      const tx = await escrow.connect(seller).cancelEscrow(escrowId);
      
      await expect(tx)
        .to.emit(escrow, "EscrowBalanceChanged")
        .withArgs(
          escrowId,
          0,
          "Escrow cancelled"
        );
    });
  });

  describe("Balance Query Functions", function () {
    let standardEscrowId: number;
    let sequentialEscrowId: number;
    
    beforeEach(async () => {
      // Create and fund a standard escrow
      await escrow.connect(seller).createEscrow(
        TRADE_ID,
        buyer.address,
        ESCROW_AMOUNT,
        false,
        ethers.ZeroAddress
      );
      standardEscrowId = 1;
      await escrow.connect(seller).fundEscrow(standardEscrowId);
      
      // Create and fund a sequential escrow
      await escrow.connect(seller).createEscrow(
        TRADE_ID + 1,
        buyer.address,
        ESCROW_AMOUNT,
        true,
        otherUser.address
      );
      sequentialEscrowId = 2;
      await escrow.connect(seller).fundEscrow(sequentialEscrowId);
    });
    
    it("Should return correct stored balance for standard escrow", async () => {
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      expect(await escrowContract.getStoredEscrowBalance(standardEscrowId)).to.equal(ESCROW_AMOUNT);
    });
    
    it("Should return correct calculated balance for funded escrow", async () => {
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      expect(await escrowContract.getCalculatedEscrowBalance(standardEscrowId)).to.equal(ESCROW_AMOUNT);
    });
    
    it("Should return zero calculated balance for created escrow", async () => {
      // Create a new escrow without funding
      await escrow.connect(seller).createEscrow(
        TRADE_ID + 2,
        buyer.address,
        ESCROW_AMOUNT,
        false,
        ethers.ZeroAddress
      );
      const newEscrowId = 3;
      
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      expect(await escrowContract.getCalculatedEscrowBalance(newEscrowId)).to.equal(0);
    });
    
    it("Should return zero calculated balance for released escrow", async () => {
      // Mark fiat as paid
      await escrow.connect(buyer).markFiatPaid(standardEscrowId);
      
      // Release the escrow
      await escrow.connect(seller).releaseEscrow(standardEscrowId);
      
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      expect(await escrowContract.getCalculatedEscrowBalance(standardEscrowId)).to.equal(0);
    });
    
    it("Should revert when querying non-existent escrow", async () => {
      const nonExistentEscrowId = 999;
      
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      
      await expect(
        escrowContract.getStoredEscrowBalance(nonExistentEscrowId)
      ).to.be.revertedWith("Escrow does not exist");
      
      await expect(
        escrowContract.getCalculatedEscrowBalance(nonExistentEscrowId)
      ).to.be.revertedWith("Escrow does not exist");
    });

    it("Should return correct calculated balance for disputed escrow", async () => {
      // Mark fiat as paid
      await escrow.connect(buyer).markFiatPaid(standardEscrowId);
      
      // Open a dispute
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("Evidence"));
      const bondAmount = ESCROW_AMOUNT * 5n / 100n; // 5% bond
      
      await escrow.connect(buyer).openDisputeWithBond(standardEscrowId, evidenceHash);
      
      // Check the calculated balance equals the escrow amount
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      expect(await escrowContract.getCalculatedEscrowBalance(standardEscrowId)).to.equal(ESCROW_AMOUNT);
    });
  });

  describe("Sequential Escrow Info", function () {
    it("Should return correct sequential escrow info for sequential escrow", async () => {
      // Create and fund a sequential escrow
      await escrow.connect(seller).createEscrow(
        TRADE_ID,
        buyer.address,
        ESCROW_AMOUNT,
        true, // sequential
        otherUser.address
      );
      const sequentialEscrowId = 1;
      
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      const [isSequential, sequentialAddress, sequentialBalance, wasReleased] = 
        await escrowContract.getSequentialEscrowInfo(sequentialEscrowId);
      
      expect(isSequential).to.equal(true);
      expect(sequentialAddress).to.equal(otherUser.address);
      expect(sequentialBalance).to.equal(0); // No balance yet at the sequential address
      expect(wasReleased).to.equal(false); // Not released yet
    });

    it("Should return correct info after sequential escrow is released", async () => {
      // Create and fund a sequential escrow
      await escrow.connect(seller).createEscrow(
        TRADE_ID,
        buyer.address,
        ESCROW_AMOUNT,
        true, // sequential
        otherUser.address
      );
      const sequentialEscrowId = 1;
      await escrow.connect(seller).fundEscrow(sequentialEscrowId);
      
      // Mark fiat as paid
      await escrow.connect(buyer).markFiatPaid(sequentialEscrowId);
      
      // Release the escrow
      await escrow.connect(seller).releaseEscrow(sequentialEscrowId);
      
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      const [isSequential, sequentialAddress, sequentialBalance, wasReleased] = 
        await escrowContract.getSequentialEscrowInfo(sequentialEscrowId);
      
      expect(isSequential).to.equal(true);
      expect(sequentialAddress).to.equal(otherUser.address);
      expect(sequentialBalance).to.equal(ESCROW_AMOUNT); // Balance now at the sequential address
      expect(wasReleased).to.equal(true); // Now released
    });

    it("Should return non-sequential info for standard escrow", async () => {
      // Create a standard escrow
      await escrow.connect(seller).createEscrow(
        TRADE_ID,
        buyer.address,
        ESCROW_AMOUNT,
        false, // not sequential
        ethers.ZeroAddress
      );
      const standardEscrowId = 1;
      
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      const [isSequential, sequentialAddress, sequentialBalance, wasReleased] = 
        await escrowContract.getSequentialEscrowInfo(standardEscrowId);
      
      expect(isSequential).to.equal(false);
      expect(sequentialAddress).to.equal(ethers.ZeroAddress);
      expect(sequentialBalance).to.equal(0);
      expect(wasReleased).to.equal(false);
    });
  });

  describe("Auto-Cancel Eligibility", function () {
    let createdEscrowId: number;
    let fundedEscrowId: number;
    
    beforeEach(async () => {
      // Create an escrow but don't fund it
      await escrow.connect(seller).createEscrow(
        TRADE_ID,
        buyer.address,
        ESCROW_AMOUNT,
        false,
        ethers.ZeroAddress
      );
      createdEscrowId = 1;
      
      // Create and fund another escrow
      await escrow.connect(seller).createEscrow(
        TRADE_ID + 1,
        buyer.address,
        ESCROW_AMOUNT,
        false,
        ethers.ZeroAddress
      );
      fundedEscrowId = 2;
      await escrow.connect(seller).fundEscrow(fundedEscrowId);
    });
    
    it("Should not be eligible for auto-cancel before deposit deadline", async () => {
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      expect(await escrowContract.isEligibleForAutoCancel(createdEscrowId)).to.equal(false);
    });
    
    it("Should be eligible for auto-cancel after deposit deadline", async () => {
      // Advance time past deposit deadline
      await time.increase(DEPOSIT_DURATION + 1);
      
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      expect(await escrowContract.isEligibleForAutoCancel(createdEscrowId)).to.equal(true);
    });
    
    it("Should not be eligible for auto-cancel for funded escrow before fiat deadline", async () => {
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      expect(await escrowContract.isEligibleForAutoCancel(fundedEscrowId)).to.equal(false);
    });
    
    it("Should be eligible for auto-cancel for funded escrow after fiat deadline", async () => {
      // Advance time past fiat deadline
      await time.increase(FIAT_DURATION + 1);
      
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      expect(await escrowContract.isEligibleForAutoCancel(fundedEscrowId)).to.equal(true);
    });
    
    it("Should not be eligible for auto-cancel if fiat is marked as paid", async () => {
      // Mark fiat as paid
      await escrow.connect(buyer).markFiatPaid(fundedEscrowId);
      
      // Advance time past fiat deadline
      await time.increase(FIAT_DURATION + 1);
      
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      expect(await escrowContract.isEligibleForAutoCancel(fundedEscrowId)).to.equal(false);
    });
    
    it("Should not be eligible for auto-cancel for released escrow", async () => {
      // Mark fiat as paid
      await escrow.connect(buyer).markFiatPaid(fundedEscrowId);
      
      // Release the escrow
      await escrow.connect(seller).releaseEscrow(fundedEscrowId);
      
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      expect(await escrowContract.isEligibleForAutoCancel(fundedEscrowId)).to.equal(false);
    });
    
    it("Should not be eligible for auto-cancel for cancelled escrow", async () => {
      // Advance time past fiat deadline
      await time.increase(FIAT_DURATION + 1);
      
      // Cancel the escrow
      await escrow.connect(seller).cancelEscrow(fundedEscrowId);
      
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      expect(await escrowContract.isEligibleForAutoCancel(fundedEscrowId)).to.equal(false);
    });
    
    it("Should not be eligible for auto-cancel for non-existent escrow", async () => {
      const nonExistentEscrowId = 999;
      
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      expect(await escrowContract.isEligibleForAutoCancel(nonExistentEscrowId)).to.equal(false);
    });
  });

  describe("Balance Updates in Dispute Resolution", function () {
    let escrowId: number;
    const evidenceHashBuyer = ethers.keccak256(ethers.toUtf8Bytes("Buyer evidence"));
    const evidenceHashSeller = ethers.keccak256(ethers.toUtf8Bytes("Seller evidence"));
    const resolutionHash = ethers.keccak256(ethers.toUtf8Bytes("Arbitrator resolution"));
    const bondAmount = ESCROW_AMOUNT * 5n / 100n; // 5% bond
    
    beforeEach(async () => {
      // Create and fund an escrow
      await escrow.connect(seller).createEscrow(
        TRADE_ID,
        buyer.address,
        ESCROW_AMOUNT,
        false,
        ethers.ZeroAddress
      );
      escrowId = 1;
      await escrow.connect(seller).fundEscrow(escrowId);
      
      // Mark fiat as paid (required for dispute)
      await escrow.connect(buyer).markFiatPaid(escrowId);
    });
    
    it("Should update balance to zero when dispute is resolved in buyer's favor", async () => {
      // Open dispute by buyer
      await escrow.connect(buyer).openDisputeWithBond(escrowId, evidenceHashBuyer);
      
      // Seller responds
      await escrow.connect(seller).respondToDisputeWithBond(escrowId, evidenceHashSeller);
      
      // Check balance before resolution
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      const storedBalanceBefore = await escrowContract.getStoredEscrowBalance(escrowId);
      expect(storedBalanceBefore).to.equal(ESCROW_AMOUNT);
      
      // Arbitrator resolves in buyer's favor
      const tx = await escrow.connect(arbitrator).resolveDisputeWithExplanation(
        escrowId,
        true, // buyer wins
        resolutionHash
      );
      
      // Check balance after resolution
      const escrowContract2 = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      const storedBalanceAfter = await escrowContract2.getStoredEscrowBalance(escrowId);
      expect(storedBalanceAfter).to.equal(0);
      
      // Check for event
      await expect(tx)
        .to.emit(escrow, "EscrowBalanceChanged")
        .withArgs(
          escrowId,
          0,
          "Dispute resolved by arbitration"
        );
    });
    
    it("Should update balance to zero when dispute is resolved in seller's favor", async () => {
      // Open dispute by buyer
      await escrow.connect(buyer).openDisputeWithBond(escrowId, evidenceHashBuyer);
      
      // Seller responds
      await escrow.connect(seller).respondToDisputeWithBond(escrowId, evidenceHashSeller);
      
      // Check balance before resolution
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      const storedBalanceBefore = await escrowContract.getStoredEscrowBalance(escrowId);
      expect(storedBalanceBefore).to.equal(ESCROW_AMOUNT);
      
      // Arbitrator resolves in seller's favor
      const tx = await escrow.connect(arbitrator).resolveDisputeWithExplanation(
        escrowId,
        false, // seller wins
        resolutionHash
      );
      
      // Check balance after resolution
      const escrowContract2 = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      const storedBalanceAfter = await escrowContract2.getStoredEscrowBalance(escrowId);
      expect(storedBalanceAfter).to.equal(0);
      
      // Check for event
      await expect(tx)
        .to.emit(escrow, "EscrowBalanceChanged")
        .withArgs(
          escrowId,
          0,
          "Dispute resolved by arbitration"
        );
    });
    
    it("Should update balance to zero on default judgment", async () => {
      // Buyer initiates dispute
      await escrow.connect(buyer).openDisputeWithBond(escrowId, evidenceHashBuyer);
      
      // Check balance before judgment
      const escrowContract = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      const storedBalanceBefore = await escrowContract.getStoredEscrowBalance(escrowId);
      expect(storedBalanceBefore).to.equal(ESCROW_AMOUNT);
      
      // Advance time past response deadline
      await time.increase(DISPUTE_RESPONSE_DURATION + 1);
      
      // Arbitrator issues default judgment
      const tx = await escrow.connect(arbitrator).defaultJudgment(escrowId);
      
      // Check balance after judgment
      const escrowContract2 = await ethers.getContractAt("YapBayEscrow", await escrow.getAddress());
      const storedBalanceAfter = await escrowContract2.getStoredEscrowBalance(escrowId);
      expect(storedBalanceAfter).to.equal(0);
      
      // Check for event
      await expect(tx)
        .to.emit(escrow, "EscrowBalanceChanged")
        .withArgs(
          escrowId,
          0,
          "Dispute resolved by default judgment"
        );
    });
  });
});