const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

// #############################################################################
// #                          CONFIGURATION                                    #
// #############################################################################

// The address of the UUPS proxy contract that you want to upgrade.
// Fetched from environment variable MAINNET_CELO_PROXY
const PROXY_ADDRESS = process.env.MAINNET_CELO_PROXY;

// The name of the new contract version (must match the contract name in your .sol file).
// If you modified YapBayEscrow.sol directly, this will be "YapBayEscrow".
// If you created YapBayEscrowV2.sol, this would be "YapBayEscrowV2".
const NEW_CONTRACT_NAME = "YapBayEscrow"; 

// #############################################################################

async function main() {
  if (!PROXY_ADDRESS || !PROXY_ADDRESS.startsWith("0x")) {
    throw new Error("PROXY_ADDRESS is not set in .env (expected MAINNET_CELO_PROXY) or is invalid.");
  }
  if (!NEW_CONTRACT_NAME) {
    throw new Error("NEW_CONTRACT_NAME is not set in scripts/upgrade_contract.js");
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log(`Upgrading proxy at: ${PROXY_ADDRESS}`);
  console.log(`Using account (owner of proxy): ${deployerAddress}`);
  
  try {
    const balance = await ethers.provider.getBalance(deployerAddress);
    console.log("Account balance:", ethers.formatEther(balance), "CELO");
  } catch (e) {
    console.warn(`Could not fetch balance for ${deployerAddress}.`);
    if (e instanceof Error) console.warn(e.message);
    else console.warn(String(e));
  }

  console.log(`Fetching new contract factory for: ${NEW_CONTRACT_NAME}...`);
  const NewContractFactory = await ethers.getContractFactory(NEW_CONTRACT_NAME);

  console.log(`Attempting to upgrade proxy ${PROXY_ADDRESS} to new implementation of ${NEW_CONTRACT_NAME}...`);
  
  const upgradedProxy = await upgrades.upgradeProxy(PROXY_ADDRESS, NewContractFactory, {
    // If your new contract version has a new initializer function (e.g., initializeV2)
    // and you want to call it as part of the upgrade process, you can specify it here.
    // call: {
    //   fn: 'initializeV2', // Name of the new initializer function in your V2 contract
    //   args: [/* arguments for initializeV2 */] 
    // },
    timeout: 0, // No timeout, or set appropriately for mainnet e.g. 600000 (10 minutes)
    // kind: 'uups' // This is usually inferred correctly for UUPS proxies but can be specified
  });

  console.log("Waiting for upgrade transaction to be mined...");
  await upgradedProxy.waitForDeployment(); // In ethers v6+, this also confirms the transaction
  console.log("Proxy upgrade transaction confirmed.");

  const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(
    upgradedProxy.target // PROXY_ADDRESS should be the same as upgradedProxy.target
  );

  console.log(`Proxy at ${PROXY_ADDRESS} successfully upgraded!`);
  console.log(`New implementation contract deployed at: ${newImplementationAddress}`);
  console.log("----------------------------------------------------");
  console.log("To verify the NEW IMPLEMENTATION contract on CeloScan:");
  console.log(
    `npx hardhat verify --network celo ${newImplementationAddress}`
  );
  console.log("----------------------------------------------------");
  console.log("The PROXY address remains the same:", upgradedProxy.target);
  console.log("Users continue to interact with this proxy address.");
  console.log("----------------------------------------------------");

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Upgrade script failed:");
    console.error(error);
    process.exit(1);
  }); 