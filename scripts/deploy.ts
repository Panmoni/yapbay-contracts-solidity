import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  // Alfajores USDC address
  const usdcAddress = "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B";
  // Deploy YapBayEscrow
  const YapBayEscrow = await ethers.getContractFactory("YapBayEscrow");
  const escrow = await upgrades.deployProxy(YapBayEscrow, [
    usdcAddress, // Use the actual Alfajores USDC address
    deployer.address // Use the deployer's address as the arbitrator
  ]);

  console.log("YapBayEscrow deployed to:", await escrow.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
