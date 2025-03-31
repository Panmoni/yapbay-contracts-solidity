import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const privateKey = process.env.ARBITRATOR_PRIVATE_KEY;

  if (!privateKey) {
    console.error("Error: ARBITRATOR_PRIVATE_KEY not found in .env file.");
    process.exit(1);
  }

  try {
    const wallet = new ethers.Wallet(privateKey);
    console.log("Private Key:", privateKey); // Be careful sharing/logging private keys
    console.log("Corresponding Public Address:", wallet.address);
  } catch (error) {
    console.error("Error deriving address from private key:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});