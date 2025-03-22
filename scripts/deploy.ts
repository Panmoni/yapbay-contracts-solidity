import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  const usdcAddress = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C"; // Celo Alfajores USDC
  const arbitratorAddress = "0xYourArbitratorAddressHere"; // Replace with your address

  const YapBayEscrow = await ethers.getContractFactory("YapBayEscrow");
  const yapBayEscrow = await upgrades.deployProxy(
    YapBayEscrow,
    [usdcAddress, arbitratorAddress],
    { initializer: "initialize" }
  );
  await yapBayEscrow.deployed();

  console.log("YapBayEscrow deployed to:", yapBayEscrow.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });