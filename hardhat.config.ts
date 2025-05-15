import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify/etherscan"; // Import the verify plugin
import "@openzeppelin/hardhat-upgrades";
import "@typechain/hardhat";
import * as dotenv from "dotenv";
dotenv.config();

// Validate essential environment variables for Celo mainnet
const mainnetCeloRpcUrl = process.env.MAINNET_CELO_RPC_URL;
const arbitratorPrivateKey = process.env.ARBITRATOR_PRIVATE_KEY;
const mainnetCeloChainIdString = process.env.MAINNET_CELO_CHAIN_ID;

// Use the user-specified environment variable for the general CeloScan API key
const envCeloscanApiKey = process.env.CELOSCAN_API_KEY; // This can be undefined

if (!mainnetCeloRpcUrl) {
  console.warn("MAINNET_CELO_RPC_URL not found in .env. Celo mainnet operations might fail.");
}
if (!arbitratorPrivateKey) {
  console.warn("ARBITRATOR_PRIVATE_KEY not found in .env. Celo mainnet operations might fail.");
}
if (!mainnetCeloChainIdString) {
  console.warn("MAINNET_CELO_CHAIN_ID not found in .env. Celo mainnet operations might fail.");
}

const mainnetCeloChainId = mainnetCeloChainIdString ? parseInt(mainnetCeloChainIdString) : 42220; // Default to Celo mainnet Chain ID

// Define a task to check balance
task("check-balance", "Prints the balance of the deployer account on the specified network")
  .addOptionalParam("account", "The account's address (optional, defaults to the first signer)")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;
    let addressToCheck;
    if (taskArgs.account) {
      addressToCheck = taskArgs.account;
      console.log(`Checking balance for specified account: ${addressToCheck} on network ${hre.network.name}`);
    } else {
      const signers = await ethers.getSigners();
      if (!signers || signers.length === 0) {
        console.error("No signers configured for this network. Ensure your Hardhat network configuration has accounts set up.");
        return;
      }
      const deployer = signers[0];
      addressToCheck = await deployer.getAddress();
      console.log(`Checking balance for default deployer account: ${addressToCheck} on network ${hre.network.name}`);
    }

    if (!addressToCheck) {
        console.error("Could not determine address to check.");
        return;
    }

    try {
        const balance = await ethers.provider.getBalance(addressToCheck);
        console.log(`Balance: ${ethers.formatEther(balance)} CELO`);
    } catch (e: any) {
        console.error(`Failed to fetch balance for ${addressToCheck} on network ${hre.network.name}.`);
        if (e instanceof Error) {
          console.error("Error details:", e.message);
        } else {
          console.error("An unexpected error occurred:", e);
        }
        console.error("Ensure your RPC URL is correct and the network is reachable.");
    }
  });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      chainId: 31337,
    },
    alfajores: {
      url: process.env.ALFAJORES_RPC_URL || "https://alfajores-forno.celo-testnet.org",
      accounts: process.env.ARBITRATOR_PRIVATE_KEY ? [process.env.ARBITRATOR_PRIVATE_KEY] : [],
      chainId: 44787
    },
    celo: {
      url: mainnetCeloRpcUrl || "",
      accounts: arbitratorPrivateKey ? [arbitratorPrivateKey] : [],
      chainId: mainnetCeloChainId,
    }
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v6",
  },
  etherscan: {
    apiKey: {
      alfajores: process.env.CELOSCAN_API_KEY || envCeloscanApiKey || "", // Use specific, then general, then empty string
      celo: process.env.CELOSCAN_API_KEY || envCeloscanApiKey || ""          // Use specific, then general, then empty string
    },
    customChains: [
      {
        network: "alfajores",
        chainId: 44787,
        urls: {
          apiURL: "https://api-alfajores.celoscan.io/api",
          browserURL: "https://alfajores.celoscan.io"
        }
      },
      {
        network: "celo",
        chainId: mainnetCeloChainId,
        urls: {
          apiURL: "https://api.celoscan.io/api",
          browserURL: "https://celoscan.io",
        },
      },
    ]
  },
};

export default config;