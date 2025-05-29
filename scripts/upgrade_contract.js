const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

// #############################################################################
// #                    UNIFIED UPGRADE CONFIGURATION                          #
// #############################################################################

// The name of the new contract version (must match the contract name in your .sol file).
// If you modified YapBayEscrow.sol directly, this will be "YapBayEscrow".
// If you created YapBayEscrowV2.sol, this would be "YapBayEscrowV2".
const NEW_CONTRACT_NAME = "YapBayEscrow"; 

// Network-specific configuration
const NETWORK_CONFIG = {
  celo: {
    proxyEnvVar: "MAINNET_CELO_PROXY",
    displayName: "Celo Mainnet",
    chainId: 42220,
    explorerUrl: "https://celoscan.io/address/",
    verifyNetwork: "celo"
  },
  alfajores: {
    proxyEnvVar: "TESTNET_CELO_PROXY", 
    displayName: "Celo Alfajores Testnet",
    chainId: 44787,
    explorerUrl: "https://alfajores.celoscan.io/address/",
    verifyNetwork: "alfajores"
  }
};

// #############################################################################

async function main() {
  // Get the current network from hardhat runtime environment
  const networkName = hre.network.name;
  const networkConfig = NETWORK_CONFIG[networkName];
  
  if (!networkConfig) {
    throw new Error(`Unsupported network: ${networkName}. Supported networks: ${Object.keys(NETWORK_CONFIG).join(", ")}`);
  }

  // Get proxy address from appropriate environment variable
  const PROXY_ADDRESS = process.env[networkConfig.proxyEnvVar];
  
  if (!PROXY_ADDRESS || !PROXY_ADDRESS.startsWith("0x")) {
    throw new Error(`PROXY_ADDRESS is not set in .env (expected ${networkConfig.proxyEnvVar}) or is invalid.`);
  }
  if (!NEW_CONTRACT_NAME) {
    throw new Error("NEW_CONTRACT_NAME is not set in scripts/upgrade_contract_unified.js");
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  // Network-specific header
  const isTestnet = networkName === "alfajores";
  const headerText = isTestnet ? "TESTNET CONTRACT UPGRADE" : "MAINNET CONTRACT UPGRADE";
  
  console.log("=".repeat(60));
  console.log(`            ${headerText}`);
  console.log("=".repeat(60));
  console.log(`Network: ${networkConfig.displayName} (Chain ID: ${networkConfig.chainId})`);
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
  
  // Adjust timeout based on network (testnet can be faster)
  const timeout = isTestnet ? 300000 : 600000; // 5 minutes for testnet, 10 for mainnet
  
  const upgradedProxy = await upgrades.upgradeProxy(PROXY_ADDRESS, NewContractFactory, {
    // If your new contract version has a new initializer function (e.g., initializeV2)
    // and you want to call it as part of the upgrade process, you can specify it here.
    // call: {
    //   fn: 'initializeV2', // Name of the new initializer function in your V2 contract
    //   args: [/* arguments for initializeV2 */] 
    // },
    timeout: timeout,
    // kind: 'uups' // This is usually inferred correctly for UUPS proxies but can be specified
  });

  console.log("Waiting for upgrade transaction to be mined...");
  await upgradedProxy.waitForDeployment(); // In ethers v6+, this also confirms the transaction
  console.log("Proxy upgrade transaction confirmed.");

  const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(
    upgradedProxy.target // PROXY_ADDRESS should be the same as upgradedProxy.target
  );

  console.log("=".repeat(60));
  console.log("              UPGRADE SUCCESSFUL!");
  console.log("=".repeat(60));
  console.log(`Proxy at ${PROXY_ADDRESS} successfully upgraded!`);
  console.log(`New implementation contract deployed at: ${newImplementationAddress}`);
  console.log("----------------------------------------------------");
  console.log("To verify the NEW IMPLEMENTATION contract:");
  console.log(
    `npx hardhat verify --network ${networkConfig.verifyNetwork} ${newImplementationAddress}`
  );
  console.log("----------------------------------------------------");
  console.log("The PROXY address remains the same:", upgradedProxy.target);
  console.log("Users continue to interact with this proxy address.");
  console.log("----------------------------------------------------");
  console.log("Explorer Links:");
  console.log(`Proxy: ${networkConfig.explorerUrl}${upgradedProxy.target}`);
  console.log(`Implementation: ${networkConfig.explorerUrl}${newImplementationAddress}`);
  console.log("=".repeat(60));

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Upgrade script failed:");
    console.error(error);
    process.exit(1);
  });