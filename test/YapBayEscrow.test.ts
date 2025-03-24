import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { YapBayEscrow, YapBayEscrow__factory } from "../typechain";

describe("YapBayEscrow", function () {
  let escrow: YapBayEscrow;
  let usdc: any;

  let deployer: any;

  beforeEach(async () => {
    [deployer] = await ethers.getSigners();
    // Deploy mock USDC
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    usdc = await upgrades.deployProxy(ERC20Mock, ["USDC", "USDC", ethers.parseUnits("1000", 6)], { kind: 'uups' });
    
    // Deploy YapBayEscrow
    const YapBayEscrow = await ethers.getContractFactory("YapBayEscrow");
    const escrowInstance = await upgrades.deployProxy(
      await ethers.getContractFactory("YapBayEscrow"),
      [await usdc.getAddress(), deployer.address],
      { kind: 'uups', initializer: 'initialize' }
    );
    escrow = YapBayEscrow__factory.connect(await escrowInstance.getAddress(), deployer);
  });

  it("Should initialize correctly", async () => {
    expect(await escrow.usdc()).to.equal(await usdc.getAddress());
    expect(await escrow.fixedArbitrator()).to.equal(deployer.address);
  });
});