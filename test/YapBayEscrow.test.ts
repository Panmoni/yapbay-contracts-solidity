import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { YapBayEscrow, ERC20Mock } from "../typechain";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("YapBayEscrow", function () {
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
  
  describe("Initialization", function () {
    it("Should initialize correctly", async () => {
      expect(await escrow.usdc()).to.equal(await usdc.getAddress());
      expect(await escrow.fixedArbitrator()).to.equal(arbitrator.address);
      expect(await escrow.nextEscrowId()).to.equal(1);
    });
    
    it("Should not initialize with zero address for USDC", async () => {
      const YapBayEscrowFactory = await ethers.getContractFactory("YapBayEscrow");
      await expect(
        upgrades.deployProxy(
          YapBayEscrowFactory,
          [ethers.ZeroAddress, arbitrator.address],
          { kind: 'uups', initializer: 'initialize' }
        )
      ).to.be.revertedWith("Invalid USDC address");
    });
    
    it("Should not initialize with zero address for arbitrator", async () => {
      const YapBayEscrowFactory = await ethers.getContractFactory("YapBayEscrow");
      await expect(
        upgrades.deployProxy(
          YapBayEscrowFactory,
          [await usdc.getAddress(), ethers.ZeroAddress],
          { kind: 'uups', initializer: 'initialize' }
        )
      ).to.be.revertedWith("E102: Invalid arbitrator address");
    });
  });
  
  describe("Escrow Creation", function () {
    it("Should create a standard escrow correctly", async () => {
      const tx = await escrow.connect(seller).createEscrow(
        TRADE_ID,
        buyer.address,
        ESCROW_AMOUNT,
        false, // not sequential
        ethers.ZeroAddress
      );
      
      const receipt = await tx.wait();
      const escrowId = 1; // First escrow ID should be 1
      
      // Check escrow details
      const escrowData = await escrow.escrows(escrowId);
      expect(escrowData.escrow_id).to.equal(escrowId);
      expect(escrowData.trade_id).to.equal(TRADE_ID);
      expect(escrowData.seller).to.equal(seller.address);
      expect(escrowData.buyer).to.equal(buyer.address);
      expect(escrowData.arbitrator).to.equal(arbitrator.address);
      expect(escrowData.amount).to.equal(ESCROW_AMOUNT);
      expect(escrowData.state).to.equal(0); // EscrowState.Created
      expect(escrowData.sequential).to.equal(false);
      expect(escrowData.sequential_escrow_address).to.equal(ethers.ZeroAddress);
      expect(escrowData.fiat_paid).to.equal(false);
      expect(escrowData.counter).to.equal(0);
      
      // Check next escrow ID incremented
      expect(await escrow.nextEscrowId()).to.equal(2);
      
      // Check event emitted
      await expect(tx)
        .to.emit(escrow, "EscrowCreated")
        .withArgs(
          escrowId,
          TRADE_ID,
          seller.address,
          buyer.address,
          arbitrator.address,
          ESCROW_AMOUNT,
          escrowData.deposit_deadline,
          0, // fiat_deadline is 0 at creation
          false, // not sequential
          ethers.ZeroAddress,
          await time.latest()
        );
    });
    
    it("Should create a sequential escrow correctly", async () => {
      const sequentialAddress = otherUser.address;
      
      const tx = await escrow.connect(seller).createEscrow(
        TRADE_ID,
        buyer.address,
        ESCROW_AMOUNT,
        true, // sequential
        sequentialAddress
      );
      
      const escrowId = 1;
      const escrowData = await escrow.escrows(escrowId);
      
      expect(escrowData.sequential).to.equal(true);
      expect(escrowData.sequential_escrow_address).to.equal(sequentialAddress);
      
      await expect(tx)
        .to.emit(escrow, "EscrowCreated")
        .withArgs(
          escrowId,
          TRADE_ID,
          seller.address,
          buyer.address,
          arbitrator.address,
          ESCROW_AMOUNT,
          escrowData.deposit_deadline,
          0, // fiat_deadline is 0 at creation
          true, // sequential
          sequentialAddress,
          await time.latest()
        );
    });
    
    it("Should not create escrow with zero amount", async () => {
      await expect(
        escrow.connect(seller).createEscrow(
          TRADE_ID,
          buyer.address,
          0, // zero amount
          false,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("E100: Invalid amount");
    });
    
    it("Should not create escrow with amount exceeding maximum", async () => {
      const excessiveAmount = MAX_AMOUNT + 1n; // Fixed: using bigint addition
      
      await expect(
        escrow.connect(seller).createEscrow(
          TRADE_ID,
          buyer.address,
          excessiveAmount,
          false,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("E101: Amount exceeds maximum limit");
    });
    
    it("Should not create escrow with zero buyer address", async () => {
      await expect(
        escrow.connect(seller).createEscrow(
          TRADE_ID,
          ethers.ZeroAddress, // zero buyer address
          ESCROW_AMOUNT,
          false,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("E102: Invalid buyer address");
    });
    
    it("Should not create sequential escrow with zero sequential address", async () => {
      await expect(
        escrow.connect(seller).createEscrow(
          TRADE_ID,
          buyer.address,
          ESCROW_AMOUNT,
          true, // sequential
          ethers.ZeroAddress // zero sequential address
        )
      ).to.be.revertedWith("E106: Missing sequential escrow address");
    });
  });
  
  describe("Funding Escrow", function () {
    let escrowId: number;
    
    beforeEach(async () => {
      // Create an escrow first
      const tx = await escrow.connect(seller).createEscrow(
        TRADE_ID,
        buyer.address,
        ESCROW_AMOUNT,
        false,
        ethers.ZeroAddress
      );
      escrowId = 1;
    });
    
    it("Should fund escrow correctly", async () => {
      const sellerBalanceBefore = await usdc.balanceOf(seller.address);
      const contractBalanceBefore = await usdc.balanceOf(await escrow.getAddress());
      
      const tx = await escrow.connect(seller).fundEscrow(escrowId);
      
      // Check balances
      const sellerBalanceAfter = await usdc.balanceOf(seller.address);
      const contractBalanceAfter = await usdc.balanceOf(await escrow.getAddress());
      
      expect(sellerBalanceAfter).to.equal(sellerBalanceBefore - ESCROW_AMOUNT);
      expect(contractBalanceAfter).to.equal(contractBalanceBefore + ESCROW_AMOUNT);
      
      // Check escrow state updated
      const escrowData = await escrow.escrows(escrowId);
      expect(escrowData.state).to.equal(1); // EscrowState.Funded
      expect(escrowData.counter).to.equal(1);
      expect(escrowData.fiat_deadline).to.be.gt(0); // fiat deadline should be set
      
      // Check event emitted
      await expect(tx)
        .to.emit(escrow, "FundsDeposited")
        .withArgs(
          escrowId,
          TRADE_ID,
          ESCROW_AMOUNT,
          1, // counter
          await time.latest()
        );
    });
    
    it("Should not allow non-seller to fund escrow", async () => {
      await expect(
        escrow.connect(buyer).fundEscrow(escrowId)
      ).to.be.revertedWith("E102: Unauthorized caller");
    });
    
    it("Should not fund escrow in wrong state", async () => {
      // Fund the escrow first
      await escrow.connect(seller).fundEscrow(escrowId);
      
      // Try to fund again
      await expect(
        escrow.connect(seller).fundEscrow(escrowId)
      ).to.be.revertedWith("E105: Invalid state transition");
    });
    
    it("Should not fund escrow after deposit deadline", async () => {
      // Advance time past deposit deadline
      await time.increase(DEPOSIT_DURATION + 1);
      
      await expect(
        escrow.connect(seller).fundEscrow(escrowId)
      ).to.be.revertedWith("E103: Deposit deadline expired");
    });
  });
  
  describe("Marking Fiat as Paid", function () {
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
    
    it("Should mark fiat as paid correctly", async () => {
      const tx = await escrow.connect(buyer).markFiatPaid(escrowId);
      
      // Check escrow state
      const escrowData = await escrow.escrows(escrowId);
      expect(escrowData.fiat_paid).to.equal(true);
      
      // Check event emitted
      await expect(tx)
        .to.emit(escrow, "FiatMarkedPaid")
        .withArgs(
          escrowId,
          TRADE_ID,
          await time.latest()
        );
    });
    
    it("Should not allow non-buyer to mark fiat as paid", async () => {
      await expect(
        escrow.connect(seller).markFiatPaid(escrowId)
      ).to.be.revertedWith("E102: Unauthorized caller");
    });
    
    it("Should not mark fiat as paid in wrong state", async () => {
      // Release the escrow first
      await escrow.connect(buyer).markFiatPaid(escrowId);
      await escrow.connect(seller).releaseEscrow(escrowId);
      
      // Create a new escrow but don't fund it
      await escrow.connect(seller).createEscrow(
        TRADE_ID + 1,
        buyer.address,
        ESCROW_AMOUNT,
        false,
        ethers.ZeroAddress
      );
      const newEscrowId = 2;
      
      // Try to mark fiat as paid on released escrow
      await expect(
        escrow.connect(buyer).markFiatPaid(escrowId)
      ).to.be.revertedWith("E105: Invalid state transition");
      
      // Try to mark fiat as paid on unfunded escrow
      await expect(
        escrow.connect(buyer).markFiatPaid(newEscrowId)
      ).to.be.revertedWith("E105: Invalid state transition");
    });
    
    it("Should not mark fiat as paid after fiat deadline", async () => {
      // Advance time past fiat deadline
      await time.increase(FIAT_DURATION + 1);
      
      await expect(
        escrow.connect(buyer).markFiatPaid(escrowId)
      ).to.be.revertedWith("E104: Fiat payment deadline expired");
    });
  });
  
  describe("Updating Sequential Address", function () {
    let escrowId: number;
    
    beforeEach(async () => {
      // Create a sequential escrow
      await escrow.connect(seller).createEscrow(
        TRADE_ID,
        buyer.address,
        ESCROW_AMOUNT,
        true, // sequential
        otherUser.address
      );
      escrowId = 1;
    });
    
    it("Should update sequential address correctly", async () => {
      const newSequentialAddress = deployer.address;
      const oldSequentialAddress = otherUser.address;
      
      const tx = await escrow.connect(buyer).updateSequentialAddress(escrowId, newSequentialAddress);
      
      // Check escrow state
      const escrowData = await escrow.escrows(escrowId);
      expect(escrowData.sequential_escrow_address).to.equal(newSequentialAddress);
      
      // Check event emitted
      await expect(tx)
        .to.emit(escrow, "SequentialAddressUpdated")
        .withArgs(
          escrowId,
          oldSequentialAddress,
          newSequentialAddress,
          await time.latest()
        );
    });
    
    it("Should not update sequential address for non-sequential escrow", async () => {
      // Create a non-sequential escrow
      await escrow.connect(seller).createEscrow(
        TRADE_ID + 1,
        buyer.address,
        ESCROW_AMOUNT,
        false,
        ethers.ZeroAddress
      );
      const nonSequentialEscrowId = 2;
      
      await expect(
        escrow.connect(buyer).updateSequentialAddress(nonSequentialEscrowId, deployer.address)
      ).to.be.revertedWith("E106: Escrow is not sequential");
    });
    
    it("Should not allow non-buyer to update sequential address", async () => {
      await expect(
        escrow.connect(seller).updateSequentialAddress(escrowId, deployer.address)
      ).to.be.revertedWith("E102: Unauthorized caller");
    });
    
    it("Should not update to zero address", async () => {
      await expect(
        escrow.connect(buyer).updateSequentialAddress(escrowId, ethers.ZeroAddress)
      ).to.be.revertedWith("E102: Invalid sequential address");
    });
    
    it("Should not update sequential address for escrow in terminal state", async () => {
      // Fund the escrow
      await escrow.connect(seller).fundEscrow(escrowId);
      
      // Mark fiat as paid
      await escrow.connect(buyer).markFiatPaid(escrowId);
      
      // Release the escrow
      await escrow.connect(seller).releaseEscrow(escrowId);
      
      await expect(
        escrow.connect(buyer).updateSequentialAddress(escrowId, deployer.address)
      ).to.be.revertedWith("E107: Escrow in terminal state");
    });
  });
  
  describe("Releasing Escrow", function () {
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
    
    it("Should release standard escrow to buyer correctly", async () => {
      // Mark fiat as paid
      await escrow.connect(buyer).markFiatPaid(standardEscrowId);
      
      const buyerBalanceBefore = await usdc.balanceOf(buyer.address);
      const contractBalanceBefore = await usdc.balanceOf(await escrow.getAddress());
      
      const tx = await escrow.connect(seller).releaseEscrow(standardEscrowId);
      
      // Check balances
      const buyerBalanceAfter = await usdc.balanceOf(buyer.address);
      const contractBalanceAfter = await usdc.balanceOf(await escrow.getAddress());
      
      expect(buyerBalanceAfter).to.equal(buyerBalanceBefore + ESCROW_AMOUNT);
      expect(contractBalanceAfter).to.equal(contractBalanceBefore - ESCROW_AMOUNT);
      
      // Check escrow state
      const escrowData = await escrow.escrows(standardEscrowId);
      expect(escrowData.state).to.equal(2); // EscrowState.Released
      expect(escrowData.counter).to.equal(2);
      
      // Check event emitted
      await expect(tx)
        .to.emit(escrow, "EscrowReleased")
        .withArgs(
          standardEscrowId,
          TRADE_ID,
          buyer.address,
          ESCROW_AMOUNT,
          2, // counter
          await time.latest(),
          "direct to buyer"
        );
    });
    
    it("Should release sequential escrow to sequential address correctly", async () => {
      // Mark fiat as paid
      await escrow.connect(buyer).markFiatPaid(sequentialEscrowId);
      
      const sequentialAddressBalanceBefore = await usdc.balanceOf(otherUser.address);
      const contractBalanceBefore = await usdc.balanceOf(await escrow.getAddress());
      
      const tx = await escrow.connect(seller).releaseEscrow(sequentialEscrowId);
      
      // Check balances
      const sequentialAddressBalanceAfter = await usdc.balanceOf(otherUser.address);
      const contractBalanceAfter = await usdc.balanceOf(await escrow.getAddress());
      
      expect(sequentialAddressBalanceAfter).to.equal(sequentialAddressBalanceBefore + ESCROW_AMOUNT);
      expect(contractBalanceAfter).to.equal(contractBalanceBefore - ESCROW_AMOUNT);
      
      // Check event emitted
      await expect(tx)
        .to.emit(escrow, "EscrowReleased")
        .withArgs(
          sequentialEscrowId,
          TRADE_ID + 1,
          buyer.address,
          ESCROW_AMOUNT,
          2, // counter
          await time.latest(),
          "sequential escrow"
        );
    });
    
    it("Should allow arbitrator to release escrow even if fiat not marked paid", async () => {
      // Don't mark fiat as paid
      
      const buyerBalanceBefore = await usdc.balanceOf(buyer.address);
      
      // Arbitrator releases
      await escrow.connect(arbitrator).releaseEscrow(standardEscrowId);
      
      const buyerBalanceAfter = await usdc.balanceOf(buyer.address);
      expect(buyerBalanceAfter).to.equal(buyerBalanceBefore + ESCROW_AMOUNT);
      
      const escrowData = await escrow.escrows(standardEscrowId);
      expect(escrowData.state).to.equal(2); // EscrowState.Released
    });
    
    it("Should not allow seller to release escrow if fiat not marked paid", async () => {
      // Don't mark fiat as paid
      
      await expect(
        escrow.connect(seller).releaseEscrow(standardEscrowId)
      ).to.be.revertedWith("E102: Unauthorized caller or fiat not confirmed");
    });
    
    it("Should not allow unauthorized users to release escrow", async () => {
      // Mark fiat as paid
      await escrow.connect(buyer).markFiatPaid(standardEscrowId);
      
      await expect(
        escrow.connect(buyer).releaseEscrow(standardEscrowId)
      ).to.be.revertedWith("E102: Unauthorized caller or fiat not confirmed");
      
      await expect(
        escrow.connect(otherUser).releaseEscrow(standardEscrowId)
      ).to.be.revertedWith("E102: Unauthorized caller or fiat not confirmed");
    });
    
    it("Should not release escrow in wrong state", async () => {
      // Mark fiat as paid
      await escrow.connect(buyer).markFiatPaid(standardEscrowId);
      
      // Release the escrow
      await escrow.connect(seller).releaseEscrow(standardEscrowId);
      
      // Try to release again
      await expect(
        escrow.connect(seller).releaseEscrow(standardEscrowId)
      ).to.be.revertedWith("E105: Invalid state transition");
    });
  });
  
  describe("Cancelling Escrow", function () {
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
    
    it("Should cancel created escrow after deposit deadline", async () => {
      // Advance time past deposit deadline
      await time.increase(DEPOSIT_DURATION + 1);
      
      const tx = await escrow.connect(seller).cancelEscrow(createdEscrowId);
      
      // Check escrow state
      const escrowData = await escrow.escrows(createdEscrowId);
      expect(escrowData.state).to.equal(3); // EscrowState.Cancelled
      expect(escrowData.counter).to.equal(1);
      
      // Check event emitted
      await expect(tx)
        .to.emit(escrow, "EscrowCancelled")
        .withArgs(
          createdEscrowId,
          TRADE_ID,
          seller.address,
          ESCROW_AMOUNT,
          1, // counter
          await time.latest()
        );
    });
    
    it("Should cancel funded escrow after fiat deadline if fiat not paid", async () => {
      // Advance time past fiat deadline
      await time.increase(FIAT_DURATION + 1);
      
      const sellerBalanceBefore = await usdc.balanceOf(seller.address);
      const contractBalanceBefore = await usdc.balanceOf(await escrow.getAddress());
      
      const tx = await escrow.connect(seller).cancelEscrow(fundedEscrowId);
      
      // Check balances
      const sellerBalanceAfter = await usdc.balanceOf(seller.address);
      const contractBalanceAfter = await usdc.balanceOf(await escrow.getAddress());
      
      expect(sellerBalanceAfter).to.equal(sellerBalanceBefore + ESCROW_AMOUNT);
      expect(contractBalanceAfter).to.equal(contractBalanceBefore - ESCROW_AMOUNT);
      
      // Check escrow state
      const escrowData = await escrow.escrows(fundedEscrowId);
      expect(escrowData.state).to.equal(3); // EscrowState.Cancelled
      expect(escrowData.counter).to.equal(2);
      
      // Check event emitted
      await expect(tx)
        .to.emit(escrow, "EscrowCancelled")
        .withArgs(
          fundedEscrowId,
          TRADE_ID + 1,
          seller.address,
          ESCROW_AMOUNT,
          2, // counter
          await time.latest()
        );
    });
    
    it("Should allow arbitrator to cancel escrow", async () => {
      // Advance time past deposit deadline
      await time.increase(DEPOSIT_DURATION + 1);
      
      await escrow.connect(arbitrator).cancelEscrow(createdEscrowId);
      
      const escrowData = await escrow.escrows(createdEscrowId);
      expect(escrowData.state).to.equal(3); // EscrowState.Cancelled
    });
    
    it("Should not allow unauthorized users to cancel escrow", async () => {
      // Advance time past deposit deadline
      await time.increase(DEPOSIT_DURATION + 1);
      
      await expect(
        escrow.connect(buyer).cancelEscrow(createdEscrowId)
      ).to.be.revertedWith("E102: Unauthorized caller");
      
      await expect(
        escrow.connect(otherUser).cancelEscrow(createdEscrowId)
      ).to.be.revertedWith("E102: Unauthorized caller");
    });
    
    it("Should not cancel created escrow before deposit deadline", async () => {
      await expect(
        escrow.connect(seller).cancelEscrow(createdEscrowId)
      ).to.be.revertedWith("Cannot cancel: deposit deadline not expired");
    });
    
    it("Should not cancel funded escrow before fiat deadline", async () => {
      await expect(
        escrow.connect(seller).cancelEscrow(fundedEscrowId)
      ).to.be.revertedWith("Cannot cancel: fiat deadline not expired");
    });
    
    it("Should not cancel funded escrow if fiat is marked as paid", async () => {
      // Mark fiat as paid
      await escrow.connect(buyer).markFiatPaid(fundedEscrowId);
      
      // Advance time past fiat deadline
      await time.increase(FIAT_DURATION + 1);
      
      await expect(
        escrow.connect(seller).cancelEscrow(fundedEscrowId)
      ).to.be.revertedWith("E105: Fiat already confirmed, cannot cancel");
    });
  });
  
  describe("Dispute Handling", function () {
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
    
    it("Should open dispute correctly by buyer", async () => {
      const buyerBalanceBefore = await usdc.balanceOf(buyer.address);
      const contractBalanceBefore = await usdc.balanceOf(await escrow.getAddress());
      
      const tx = await escrow.connect(buyer).openDisputeWithBond(escrowId, evidenceHashBuyer);
      
      // Check balances
      const buyerBalanceAfter = await usdc.balanceOf(buyer.address);
      const contractBalanceAfter = await usdc.balanceOf(await escrow.getAddress());
      
      expect(buyerBalanceAfter).to.equal(buyerBalanceBefore - bondAmount);
      expect(contractBalanceAfter).to.equal(contractBalanceBefore + bondAmount);
      
      // Check escrow state
      const escrowData = await escrow.escrows(escrowId);
      expect(escrowData.state).to.equal(4); // EscrowState.Disputed
      expect(escrowData.counter).to.equal(2);
      expect(escrowData.dispute_initiator).to.equal(buyer.address);
      expect(escrowData.dispute_bond_buyer).to.equal(bondAmount);
      expect(escrowData.dispute_evidence_hash_buyer).to.equal(evidenceHashBuyer);
      expect(escrowData.dispute_bond_seller).to.equal(0);
      expect(escrowData.dispute_evidence_hash_seller).to.equal(ethers.ZeroHash);
      
      // Check event emitted
      await expect(tx)
        .to.emit(escrow, "DisputeOpened")
        .withArgs(
          escrowId,
          TRADE_ID,
          buyer.address,
          bondAmount,
          await time.latest()
        );
    });
    
    it("Should open dispute correctly by seller", async () => {
      const sellerBalanceBefore = await usdc.balanceOf(seller.address);
      const contractBalanceBefore = await usdc.balanceOf(await escrow.getAddress());
      
      const tx = await escrow.connect(seller).openDisputeWithBond(escrowId, evidenceHashSeller);
      
      // Check balances
      const sellerBalanceAfter = await usdc.balanceOf(seller.address);
      const contractBalanceAfter = await usdc.balanceOf(await escrow.getAddress());
      
      expect(sellerBalanceAfter).to.equal(sellerBalanceBefore - bondAmount);
      expect(contractBalanceAfter).to.equal(contractBalanceBefore + bondAmount);
      
      // Check escrow state
      const escrowData = await escrow.escrows(escrowId);
      expect(escrowData.state).to.equal(4); // EscrowState.Disputed
      expect(escrowData.counter).to.equal(2);
      expect(escrowData.dispute_initiator).to.equal(seller.address);
      expect(escrowData.dispute_bond_seller).to.equal(bondAmount);
      expect(escrowData.dispute_evidence_hash_seller).to.equal(evidenceHashSeller);
      expect(escrowData.dispute_bond_buyer).to.equal(0);
      expect(escrowData.dispute_evidence_hash_buyer).to.equal(ethers.ZeroHash);
    });
    
    it("Should not open dispute if fiat not marked as paid", async () => {
      // Create and fund a new escrow without marking fiat as paid
      await escrow.connect(seller).createEscrow(
        TRADE_ID + 1,
        buyer.address,
        ESCROW_AMOUNT,
        false,
        ethers.ZeroAddress
      );
      const newEscrowId = 2;
      await escrow.connect(seller).fundEscrow(newEscrowId);
      
      await expect(
        escrow.connect(buyer).openDisputeWithBond(newEscrowId, evidenceHashBuyer)
      ).to.be.revertedWith("Fiat must be confirmed before dispute");
    });
    
    it("Should not allow unauthorized users to open dispute", async () => {
      await expect(
        escrow.connect(otherUser).openDisputeWithBond(escrowId, evidenceHashBuyer)
      ).to.be.revertedWith("E102: Unauthorized caller");
    });
    
    it("Should not open dispute in wrong state", async () => {
      // Open a dispute first
      await escrow.connect(buyer).openDisputeWithBond(escrowId, evidenceHashBuyer);
      
      // Try to open another dispute
      await expect(
        escrow.connect(seller).openDisputeWithBond(escrowId, evidenceHashSeller)
      ).to.be.revertedWith("E105: Invalid state transition");
    });
    
    describe("Dispute Response", function () {
      beforeEach(async () => {
        // Buyer initiates dispute
        await escrow.connect(buyer).openDisputeWithBond(escrowId, evidenceHashBuyer);
      });
      
      it("Should allow seller to respond to dispute", async () => {
        const sellerBalanceBefore = await usdc.balanceOf(seller.address);
        const contractBalanceBefore = await usdc.balanceOf(await escrow.getAddress());
        
        const tx = await escrow.connect(seller).respondToDisputeWithBond(escrowId, evidenceHashSeller);
        
        // Check balances
        const sellerBalanceAfter = await usdc.balanceOf(seller.address);
        const contractBalanceAfter = await usdc.balanceOf(await escrow.getAddress());
        
        expect(sellerBalanceAfter).to.equal(sellerBalanceBefore - bondAmount);
        expect(contractBalanceAfter).to.equal(contractBalanceBefore + bondAmount);
        
        // Check escrow state
        const escrowData = await escrow.escrows(escrowId);
        expect(escrowData.dispute_bond_seller).to.equal(bondAmount);
        expect(escrowData.dispute_evidence_hash_seller).to.equal(evidenceHashSeller);
        
        // Check event emitted
        await expect(tx)
          .to.emit(escrow, "DisputeResponse")
          .withArgs(
            escrowId,
            seller.address,
            bondAmount,
            evidenceHashSeller
          );
      });
      
      it("Should not allow wrong party to respond to dispute", async () => {
        await expect(
          escrow.connect(buyer).respondToDisputeWithBond(escrowId, evidenceHashBuyer)
        ).to.be.revertedWith("E102: Unauthorized caller");
        
        await expect(
          escrow.connect(otherUser).respondToDisputeWithBond(escrowId, evidenceHashSeller)
        ).to.be.revertedWith("E102: Unauthorized caller");
      });
      
      it("Should not allow responding after response period", async () => {
        // Advance time past response deadline
        await time.increase(DISPUTE_RESPONSE_DURATION + 1);
        
        await expect(
          escrow.connect(seller).respondToDisputeWithBond(escrowId, evidenceHashSeller)
        ).to.be.revertedWith("E111: Dispute response period expired");
      });
      
      it("Should not allow responding twice", async () => {
        // Respond once
        await escrow.connect(seller).respondToDisputeWithBond(escrowId, evidenceHashSeller);
        
        // Try to respond again
        await expect(
          escrow.connect(seller).respondToDisputeWithBond(escrowId, evidenceHashSeller)
        ).to.be.revertedWith("Dispute already responded by seller");
      });
    });
    
    describe("Default Judgment", function () {
      beforeEach(async () => {
        // Buyer initiates dispute
        await escrow.connect(buyer).openDisputeWithBond(escrowId, evidenceHashBuyer);
      });
      
      it("Should allow default judgment when seller doesn't respond", async () => {
        // Advance time past response deadline
        await time.increase(DISPUTE_RESPONSE_DURATION + 1);
        
        const buyerBalanceBefore = await usdc.balanceOf(buyer.address);
        const arbitratorBalanceBefore = await usdc.balanceOf(arbitrator.address);
        const contractBalanceBefore = await usdc.balanceOf(await escrow.getAddress());
        
        const tx = await escrow.connect(arbitrator).defaultJudgment(escrowId);
        
        // Check balances - buyer should get escrow amount + their bond back
        const buyerBalanceAfter = await usdc.balanceOf(buyer.address);
        const arbitratorBalanceAfter = await usdc.balanceOf(arbitrator.address);
        const contractBalanceAfter = await usdc.balanceOf(await escrow.getAddress());
        
        expect(buyerBalanceAfter).to.equal(buyerBalanceBefore + ESCROW_AMOUNT + bondAmount);
        expect(contractBalanceAfter).to.equal(contractBalanceBefore - ESCROW_AMOUNT - bondAmount);
        
        // Check escrow state
        const escrowData = await escrow.escrows(escrowId);
        expect(escrowData.state).to.equal(5); // EscrowState.Resolved
        expect(escrowData.counter).to.equal(3);
        
        // Check event emitted
        await expect(tx)
          .to.emit(escrow, "DisputeResolved")
          .withArgs(
            escrowId,
            true, // buyer wins
            ethers.ZeroHash,
            "Buyer wins by default"
          );
      });
      
      it("Should allow default judgment when buyer doesn't respond to seller-initiated dispute", async () => {
        // Create a new escrow for this test
        await escrow.connect(seller).createEscrow(
          TRADE_ID + 1,
          buyer.address,
          ESCROW_AMOUNT,
          false,
          ethers.ZeroAddress
        );
        const newEscrowId = 2;
        await escrow.connect(seller).fundEscrow(newEscrowId);
        await escrow.connect(buyer).markFiatPaid(newEscrowId);
        
        // Seller initiates dispute
        await escrow.connect(seller).openDisputeWithBond(newEscrowId, evidenceHashSeller);
        
        // Advance time past response deadline
        await time.increase(DISPUTE_RESPONSE_DURATION + 1);
        
        const sellerBalanceBefore = await usdc.balanceOf(seller.address);
        const arbitratorBalanceBefore = await usdc.balanceOf(arbitrator.address);
        
        const tx = await escrow.connect(arbitrator).defaultJudgment(newEscrowId);
        
        // Check balances - seller should get escrow amount + their bond back
        const sellerBalanceAfter = await usdc.balanceOf(seller.address);
        const arbitratorBalanceAfter = await usdc.balanceOf(arbitrator.address);
        
        expect(sellerBalanceAfter).to.equal(sellerBalanceBefore + ESCROW_AMOUNT + bondAmount);
        
        // Check escrow state
        const escrowData = await escrow.escrows(newEscrowId);
        expect(escrowData.state).to.equal(5); // EscrowState.Resolved
        
        // Check event emitted
        await expect(tx)
          .to.emit(escrow, "DisputeResolved")
          .withArgs(
            newEscrowId,
            false, // seller wins
            ethers.ZeroHash,
            "Seller wins by default"
          );
      });
      
      it("Should not allow default judgment before response period ends", async () => {
        await expect(
          escrow.connect(arbitrator).defaultJudgment(escrowId)
        ).to.be.revertedWith("Response period not expired");
      });
      
      it("Should not allow default judgment when both parties have responded", async () => {
        // Seller responds to dispute
        await escrow.connect(seller).respondToDisputeWithBond(escrowId, evidenceHashSeller);
        
        // Advance time past response deadline
        await time.increase(DISPUTE_RESPONSE_DURATION + 1);
        
        await expect(
          escrow.connect(arbitrator).defaultJudgment(escrowId)
        ).to.be.revertedWith("Cannot apply default judgment when both parties responded");
      });
      
      it("Should not allow non-arbitrator to issue default judgment", async () => {
        // Advance time past response deadline
        await time.increase(DISPUTE_RESPONSE_DURATION + 1);
        
        await expect(
          escrow.connect(seller).defaultJudgment(escrowId)
        ).to.be.revertedWith("E102: Unauthorized caller");
        
        await expect(
          escrow.connect(buyer).defaultJudgment(escrowId)
        ).to.be.revertedWith("E102: Unauthorized caller");
      });
    });
    
    describe("Dispute Resolution", function () {
      beforeEach(async () => {
        // Buyer initiates dispute
        await escrow.connect(buyer).openDisputeWithBond(escrowId, evidenceHashBuyer);
        // Seller responds
        await escrow.connect(seller).respondToDisputeWithBond(escrowId, evidenceHashSeller);
      });
      
      it("Should resolve dispute in buyer's favor correctly", async () => {
        const buyerBalanceBefore = await usdc.balanceOf(buyer.address);
        const sellerBalanceBefore = await usdc.balanceOf(seller.address);
        const arbitratorBalanceBefore = await usdc.balanceOf(arbitrator.address);
        const contractBalanceBefore = await usdc.balanceOf(await escrow.getAddress());
        
        const tx = await escrow.connect(arbitrator).resolveDisputeWithExplanation(
          escrowId,
          true, // buyer wins
          resolutionHash
        );
        
        // Check balances
        const buyerBalanceAfter = await usdc.balanceOf(buyer.address);
        const sellerBalanceAfter = await usdc.balanceOf(seller.address);
        const arbitratorBalanceAfter = await usdc.balanceOf(arbitrator.address);
        const contractBalanceAfter = await usdc.balanceOf(await escrow.getAddress());
        
        // Buyer gets escrow amount + their bond back
        expect(buyerBalanceAfter).to.equal(buyerBalanceBefore + ESCROW_AMOUNT + bondAmount);
        // Seller's bond goes to arbitrator
        expect(arbitratorBalanceAfter).to.equal(arbitratorBalanceBefore + bondAmount);
        // Contract balance decreases by escrow amount + buyer bond
        expect(contractBalanceAfter).to.equal(contractBalanceBefore - ESCROW_AMOUNT - bondAmount - bondAmount);
        
        // Check escrow state
        const escrowData = await escrow.escrows(escrowId);
        expect(escrowData.state).to.equal(5); // EscrowState.Resolved
        expect(escrowData.counter).to.equal(3);
        expect(escrowData.dispute_resolution_hash).to.equal(resolutionHash);
        
        // Check event emitted
        await expect(tx)
          .to.emit(escrow, "DisputeResolved")
          .withArgs(
            escrowId,
            true, // buyer wins
            resolutionHash,
            "Buyer wins: buyer bond returned, seller bond to arbitrator"
          );
      });
      
      it("Should resolve dispute in seller's favor correctly", async () => {
        const buyerBalanceBefore = await usdc.balanceOf(buyer.address);
        const sellerBalanceBefore = await usdc.balanceOf(seller.address);
        const arbitratorBalanceBefore = await usdc.balanceOf(arbitrator.address);
        const contractBalanceBefore = await usdc.balanceOf(await escrow.getAddress());
        
        const tx = await escrow.connect(arbitrator).resolveDisputeWithExplanation(
          escrowId,
          false, // seller wins
          resolutionHash
        );
        
        // Check balances
        const buyerBalanceAfter = await usdc.balanceOf(buyer.address);
        const sellerBalanceAfter = await usdc.balanceOf(seller.address);
        const arbitratorBalanceAfter = await usdc.balanceOf(arbitrator.address);
        const contractBalanceAfter = await usdc.balanceOf(await escrow.getAddress());
        
        // Seller gets escrow amount + their bond back
        expect(sellerBalanceAfter).to.equal(sellerBalanceBefore + ESCROW_AMOUNT + bondAmount);
        // Buyer's bond goes to arbitrator
        expect(arbitratorBalanceAfter).to.equal(arbitratorBalanceBefore + bondAmount);
        // Contract balance decreases by escrow amount + seller bond + buyer bond
        expect(contractBalanceAfter).to.equal(contractBalanceBefore - ESCROW_AMOUNT - bondAmount - bondAmount);
        
        // Check event emitted
        await expect(tx)
          .to.emit(escrow, "DisputeResolved")
          .withArgs(
            escrowId,
            false, // seller wins
            resolutionHash,
            "Seller wins: seller bond returned, buyer bond to arbitrator"
          );
      });
      
      it("Should resolve sequential dispute in buyer's favor correctly", async () => {
        // Create a sequential escrow
        await escrow.connect(seller).createEscrow(
          TRADE_ID + 1,
          buyer.address,
          ESCROW_AMOUNT,
          true, // sequential
          otherUser.address
        );
        const sequentialEscrowId = 2;
        await escrow.connect(seller).fundEscrow(sequentialEscrowId);
        await escrow.connect(buyer).markFiatPaid(sequentialEscrowId);
        
        // Buyer initiates dispute
        await escrow.connect(buyer).openDisputeWithBond(sequentialEscrowId, evidenceHashBuyer);
        // Seller responds
        await escrow.connect(seller).respondToDisputeWithBond(sequentialEscrowId, evidenceHashSeller);
        
        const sequentialAddressBalanceBefore = await usdc.balanceOf(otherUser.address);
        
        await escrow.connect(arbitrator).resolveDisputeWithExplanation(
          sequentialEscrowId,
          true, // buyer wins
          resolutionHash
        );
        
        // Check sequential address balance
        const sequentialAddressBalanceAfter = await usdc.balanceOf(otherUser.address);
        expect(sequentialAddressBalanceAfter).to.equal(sequentialAddressBalanceBefore + ESCROW_AMOUNT);
      });
      
      it("Should not allow non-arbitrator to resolve dispute", async () => {
        await expect(
          escrow.connect(seller).resolveDisputeWithExplanation(escrowId, false, resolutionHash)
        ).to.be.revertedWith("E102: Unauthorized caller");
        
        await expect(
          escrow.connect(buyer).resolveDisputeWithExplanation(escrowId, true, resolutionHash)
        ).to.be.revertedWith("E102: Unauthorized caller");
      });
      
      it("Should not resolve dispute after arbitration deadline", async () => {
        // Advance time past arbitration deadline
        await time.increase(DISPUTE_RESPONSE_DURATION + ARBITRATION_DURATION + 1);
        
        await expect(
          escrow.connect(arbitrator).resolveDisputeWithExplanation(escrowId, true, resolutionHash)
        ).to.be.revertedWith("E113: Arbitration deadline exceeded");
      });
      
      it("Should not resolve dispute in wrong state", async () => {
        // Resolve the dispute
        await escrow.connect(arbitrator).resolveDisputeWithExplanation(escrowId, true, resolutionHash);
        
        // Try to resolve again
        await expect(
          escrow.connect(arbitrator).resolveDisputeWithExplanation(escrowId, false, resolutionHash)
        ).to.be.revertedWith("E105: Invalid state transition");
      });
    });
  });
  
  describe("Auto-Cancellation", function () {
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
    
    it("Should auto-cancel created escrow after deposit deadline", async () => {
      // Advance time past deposit deadline
      await time.increase(DEPOSIT_DURATION + 1);
      
      const tx = await escrow.connect(arbitrator).autoCancel(createdEscrowId);
      
      // Check escrow state
      const escrowData = await escrow.escrows(createdEscrowId);
      expect(escrowData.state).to.equal(3); // EscrowState.Cancelled
      expect(escrowData.counter).to.equal(1);
      
      // Check event emitted
      await expect(tx)
        .to.emit(escrow, "EscrowCancelled")
        .withArgs(
          createdEscrowId,
          TRADE_ID,
          seller.address,
          ESCROW_AMOUNT,
          1, // counter
          await time.latest()
        );
    });
    
    it("Should auto-cancel funded escrow after fiat deadline if fiat not paid", async () => {
      // Advance time past fiat deadline
      await time.increase(FIAT_DURATION + 1);
      
      const sellerBalanceBefore = await usdc.balanceOf(seller.address);
      const contractBalanceBefore = await usdc.balanceOf(await escrow.getAddress());
      
      const tx = await escrow.connect(arbitrator).autoCancel(fundedEscrowId);
      
      // Check balances
      const sellerBalanceAfter = await usdc.balanceOf(seller.address);
      const contractBalanceAfter = await usdc.balanceOf(await escrow.getAddress());
      
      expect(sellerBalanceAfter).to.equal(sellerBalanceBefore + ESCROW_AMOUNT);
      expect(contractBalanceAfter).to.equal(contractBalanceBefore - ESCROW_AMOUNT);
      
      // Check escrow state
      const escrowData = await escrow.escrows(fundedEscrowId);
      expect(escrowData.state).to.equal(3); // EscrowState.Cancelled
      expect(escrowData.counter).to.equal(2);
    });
    
    it("Should not allow non-arbitrator to auto-cancel", async () => {
      // Advance time past deposit deadline
      await time.increase(DEPOSIT_DURATION + 1);
      
      await expect(
        escrow.connect(seller).autoCancel(createdEscrowId)
      ).to.be.revertedWith("E102: Unauthorized caller");
      
      await expect(
        escrow.connect(buyer).autoCancel(createdEscrowId)
      ).to.be.revertedWith("E102: Unauthorized caller");
    });
    
    it("Should not auto-cancel created escrow before deposit deadline", async () => {
      await expect(
        escrow.connect(arbitrator).autoCancel(createdEscrowId)
      ).to.be.revertedWith("Deposit deadline not expired");
    });
    
    it("Should not auto-cancel funded escrow before fiat deadline", async () => {
      await expect(
        escrow.connect(arbitrator).autoCancel(fundedEscrowId)
      ).to.be.revertedWith("Fiat deadline not expired");
    });
    
    it("Should not auto-cancel funded escrow if fiat is marked as paid", async () => {
      // Mark fiat as paid
      await escrow.connect(buyer).markFiatPaid(fundedEscrowId);
      
      // Advance time past fiat deadline
      await time.increase(FIAT_DURATION + 1);
      
      await expect(
        escrow.connect(arbitrator).autoCancel(fundedEscrowId)
      ).to.be.revertedWith("Fiat already paid; cannot auto-cancel");
    });
    
    it("Should not auto-cancel escrow in terminal state", async () => {
      // Advance time past deposit deadline
      await time.increase(DEPOSIT_DURATION + 1);
      
      // Cancel the escrow
      await escrow.connect(arbitrator).autoCancel(createdEscrowId);
      
      // Try to auto-cancel again
      await expect(
        escrow.connect(arbitrator).autoCancel(createdEscrowId)
      ).to.be.revertedWith("E107: Escrow in terminal state");
    });
  });
});
