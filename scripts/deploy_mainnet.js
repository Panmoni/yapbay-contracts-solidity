const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

async function main() {
  // Get the deployer (signer) - this will be the account associated with ARBITRATOR_PRIVATE_KEY
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log("Deploying contracts with the account (derived from ARBITRATOR_PRIVATE_KEY):", deployerAddress);
  // Fetching balance requires the provider to be connected, ensure RPC URL is valid
  try {
    // Correct way to get balance with ethers v6
    const balance = await ethers.provider.getBalance(deployerAddress);
    console.log("Account balance:", ethers.formatEther(balance), "CELO");
  } catch (e) {
    console.warn(`Could not fetch balance for ${deployerAddress}. Ensure network RPC is correctly configured and reachable.`);
    if (e instanceof Error) console.warn(e.message);
    else console.warn(String(e));
  }

  const usdcAddress = process.env.MAINNET_CELO_USDC; // Using the specified environment variable
  const arbitratorAddress = deployerAddress; // Arbitrator is the deployer

  if (!usdcAddress) {
    throw new Error("MAINNET_CELO_USDC is not set in .env file");
  }
  if (!process.env.MAINNET_CELO_RPC_URL){ // Check if RPC URL is set, as it's crucial
      throw new Error("MAINNET_CELO_RPC_URL is not set in .env file. Deployment will fail.")
  }

  console.log(`Initializing with USDC Address (from MAINNET_CELO_USDC): ${usdcAddress}`);
  console.log(`Initializing with Arbitrator Address (deployer): ${arbitratorAddress}`);

  const YapBayEscrow = await ethers.getContractFactory("YapBayEscrow");

  console.log("Deploying YapBayEscrow (UUPS Proxy) to Celo mainnet...");
  const yapBayEscrowProxy = await upgrades.deployProxy(
    YapBayEscrow,
    [usdcAddress, arbitratorAddress], // Arguments for initialize function
    {
      initializer: "initialize",
      kind: "uups",
      timeout: 0, // Consider a timeout for mainnet deployments if needed e.g. 600000 (10 minutes)
    }
  );

  console.log("Waiting for proxy deployment transaction to be mined...");
  // Correct way to wait for deployment in ethers v6+
  await yapBayEscrowProxy.waitForDeployment(); 
  console.log("Proxy deployment confirmed.");

  const implementationAddress = await upgrades.erc1967.getImplementationAddress(
    yapBayEscrowProxy.target // In ethers v6, the address is on .target
  );

  console.log("YapBayEscrow Proxy deployed to:", yapBayEscrowProxy.target);
  console.log("YapBayEscrow Implementation deployed to:", implementationAddress);
  console.log("----------------------------------------------------");
  console.log("To verify the IMPLEMENTATION contract on CeloScan:");
  console.log(
    `npx hardhat verify --network celo ${implementationAddress}`
  );
  console.log("----------------------------------------------------");
  console.log("To verify the PROXY contract on CeloScan:");
  console.log(
    `npx hardhat verify --network celo ${yapBayEscrowProxy.target}`
  );
  console.log(
    "Note: For proxy verification, CeloScan might ask for the implementation address, or you might need to choose 'Verify Proxy' and link it."
  );
  console.log("----------------------------------------------------");

  // Verify contract states after deployment
  const deployedProxy = await ethers.getContractAt("YapBayEscrow", yapBayEscrowProxy.target);
  const owner = await deployedProxy.owner();
  const fixedArbitrator = await deployedProxy.fixedArbitrator();
  const usdcTokenAddress = await deployedProxy.usdc();

  console.log(`Deployment complete. Owner of proxy is: ${owner}`);
  console.log(`Fixed arbitrator in contract is: ${fixedArbitrator}`);
  console.log(`USDC address in contract is: ${usdcTokenAddress}`);
  console.log("----------------------------------------------------");

  if (owner.toLowerCase() !== deployerAddress.toLowerCase()) {
      console.warn(`WARNING: Proxy owner ${owner} is different from deployer ${deployerAddress}!`);
  }
  if (fixedArbitrator.toLowerCase() !== arbitratorAddress.toLowerCase()) {
      console.warn(`WARNING: Contract arbitrator ${fixedArbitrator} is different from expected ${arbitratorAddress}!`);
  }
   if (usdcTokenAddress.toLowerCase() !== usdcAddress.toLowerCase()) {
      console.warn(`WARNING: Contract USDC address ${usdcTokenAddress} is different from expected ${usdcAddress}!`);
  }

  // Example: Transfer ownership of the proxy (optional)
  // const newOwner = "0xNEW_OWNER_ADDRESS"; // Replace with the actual new owner address
  // if (newOwner && newOwner !== deployerAddress) {
  //   console.log(`Transferring ownership of proxy to: ${newOwner}...`);
  //   const tx = await yapBayEscrowProxy.transferOwnership(newOwner);
  //   await tx.wait();
  //   console.log(`Ownership of proxy transferred to ${newOwner}`);
  //   console.log(`Current owner of proxy is: ${await yapBayEscrowProxy.owner()}`);
  // } else {
  //   console.log("Proxy ownership remains with the deployer.");
  // }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment script failed:");
    console.error(error);
    process.exit(1);
  }); 