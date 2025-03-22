import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  // Deploy mock USDC if needed
  const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
  const usdc = await ERC20Mock.deploy("USDC", "USDC", 6);
  
  // Deploy YapBayEscrow
  const YapBayEscrow = await ethers.getContractFactory("YapBayEscrow");
  const escrow = await upgrades.deployProxy(YapBayEscrow, [
    usdc.address,
    process.env.ARBITRATOR_ADDRESS
  ]);

  console.log("YapBayEscrow deployed to:", await escrow.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
