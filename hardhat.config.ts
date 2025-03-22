import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "@typechain/hardhat";
import * as dotenv from "dotenv";

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
      url: process.env.NETWORK_URL || "",
      accounts: process.env.ARBITRATOR_PRIVATE_KEY ? [process.env.ARBITRATOR_PRIVATE_KEY] : [],
    }
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v6",
  },
};

export default config;