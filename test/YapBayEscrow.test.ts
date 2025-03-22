import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { YapBayEscrow, YapBayEscrow__factory } from "../typechain";

describe("YapBayEscrow", function () {
  let escrow: YapBayEscrow;
  let usdc: any;

  beforeEach(async () => {
    // Deploy mock USDC
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    usdc = await ERC20Mock.deploy("USDC", "USDC", 6);
    
    // Deploy YapBayEscrow
    const YapBayEscrow = await ethers.getContractFactory("YapBayEscrow");
    const deployed = await upgrades.deployProxy(YapBayEscrow, [
      usdc.address,
      process.env.ARBITRATOR_ADDRESS
    ]);
    escrow = YapBayEscrow__factory.connect(deployed.target as string, deployed.runner);
  });

  it("Should initialize correctly", async () => {
    expect(await escrow.usdc()).to.equal(usdc.address);
    expect(await escrow.fixedArbitrator()).to.equal(process.env.ARBITRATOR_ADDRESS);
  });
});