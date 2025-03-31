import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify/etherscan"; // Import the verify plugin
import "@openzeppelin/hardhat-upgrades";
import "@typechain/hardhat";
import * as dotenv from "dotenv";
dotenv.config();
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
      url: "https://alfajores-forno.celo-testnet.org",
      accounts: process.env.ARBITRATOR_PRIVATE_KEY ? [process.env.ARBITRATOR_PRIVATE_KEY] : [],
      chainId: 44787
    } // Remove comma here
  }, // Add comma here after networks object
  typechain: {
    outDir: "typechain",
    target: "ethers-v6",
  },
  etherscan: {
    apiKey: {
      alfajores: process.env.CELOSCAN_API_KEY || ""
    },
    customChains: [
      {
        network: "alfajores",
        chainId: 44787,
        urls: {
          apiURL: "https://api-alfajores.celoscan.io/api",
          browserURL: "https://alfajores.celoscan.io"
        }
      }
    ]
  },
};

export default config;