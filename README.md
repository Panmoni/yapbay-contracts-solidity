# YapBay Escrow Smart Contract

Welcome to the YapBay Escrow repository! This project implements an upgradeable, on-chain escrow smart contract to be deployed on the Celo blockchain, utilizing USDC as the sole payment token. The contract supports standard escrow trades as well as sequential (chained remittance) trades, with built-in dispute resolution mechanisms.

## Overview

The `YapBayEscrow` smart contract facilitates secure peer-to-peer transactions by holding funds in escrow until conditions are met. It enforces deadlines for deposit and fiat payment confirmation, supports dispute resolution with bond requirements, and allows for sequential trades where funds are transferred to another escrow contract.

### Key Features
- **USDC Support**: Uses USDC (6 decimals) with a maximum escrow amount of 100 USDC.
- **Roles**:
  - **Seller**: Creates and funds the escrow.
  - **Buyer**: Confirms fiat payment on-chain.
  - **Arbitrator**: A fixed address that resolves disputes or triggers auto-cancellation.
- **Deadlines**:
  - Deposit deadline: 15 minutes after escrow creation.
  - Fiat payment deadline: 30 minutes after funding.
- **Dispute Management**: Requires a 5% bond and SHA-256 evidence hash from each party.
- **Upgradeability**: Built with OpenZeppelin’s upgradeable contracts for future enhancements.
- **Sequential Trades**: Supports chained remittance by transferring funds to another escrow contract.

### Deployment
- **Network**: Designed for deployment on Celo (e.g., Alfajores testnet or mainnet).
- **USDC Address (Celo Mainnet)**: `0xcebA9300f2b948710d2653dD7B07f33A8B32118C`.
- **Testnet**: Compatible with Alfajores testnet via `https://alfajores-forno.celo-testnet.org`.

## Repository Structure

- **`YapBayEscrow.sol`**: The core Solidity smart contract implementing the escrow logic.
- **`YapBayEscrow.test.ts`**: Test suite written in TypeScript using Hardhat and Chai for contract validation.
- **`package.json`**: Project configuration file listing dependencies and scripts.

## Prerequisites

- **Node.js**: v16.x or higher.
- **npm**: v8.x or higher.
- **Hardhat**: Ethereum development environment.
- **Celo Network Access**: Either a local node or a remote endpoint (e.g., Alfajores testnet).
- **Environment Variables**: A `.env` file with `ARBITRATOR_ADDRESS` set to the arbitrator’s Ethereum address.

## Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Panmoni/yapbay-contracts-solidity.git
   cd yapbay-contracts-solidity
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   Create a `.env` file in the root directory with the following:
   ```plaintext
   ARBITRATOR_ADDRESS=<arbitrator-ethereum-address>
   ```

## Usage

### Compile the Contract
```bash
npx hardhat compile
```

### Run Tests
```bash
npx hardhat test
```
The test suite (`YapBayEscrow.test.ts`) verifies:
- Correct initialization of the contract with USDC and arbitrator addresses.

### Deploy the Contract
1. Update `hardhat.config.ts` (or create one) with your network configuration:
   ```typescript
   import { HardhatUserConfig } from "hardhat/config";
   import "@nomicfoundation/hardhat-toolbox";
   import "dotenv/config";

   const config: HardhatUserConfig = {
     solidity: "0.8.17",
     networks: {
       alfajores: {
         url: "https://alfajores-forno.celo-testnet.org",
         accounts: [process.env.PRIVATE_KEY],
       },
     },
   };

   export default config;
   ```

2. Deploy the proxy contract:
   ```bash
   npx hardhat run scripts/deploy.ts --network alfajores
   ```

## Contract Details

### States
- `Created`: Escrow is initialized but not funded.
- `Funded`: Seller has deposited USDC.
- `Released`: Funds are transferred to the buyer or sequential escrow.
- `Cancelled`: Escrow is terminated, funds returned to the seller.
- `Disputed`: A dispute is active.
- `Resolved`: Dispute is settled by the arbitrator.

### Functions
- **createEscrow**: Seller creates a new escrow.
- **fundEscrow**: Seller deposits USDC into the escrow.
- **markFiatPaid**: Buyer confirms fiat payment.
- **releaseEscrow**: Seller (after fiat confirmation) or arbitrator releases funds.
- **cancelEscrow**: Cancels the escrow if deadlines are missed.
- **openDisputeWithBond**: Initiates a dispute with a 5% bond.
- **resolveDisputeWithExplanation**: Arbitrator resolves the dispute.

### Events
- `EscrowCreated`: Emitted when a new escrow is created.
- `FundsDeposited`: Emitted when USDC is deposited.
- `FiatMarkedPaid`: Emitted when the buyer confirms fiat payment.
- `EscrowReleased`: Emitted when funds are released.
- `DisputeOpened`: Emitted when a dispute is initiated.

## Testing

The test suite (`YapBayEscrow.test.ts`) uses Hardhat and Chai to ensure:
- Proper initialization of USDC and arbitrator addresses.
- Add more tests to cover funding, releasing, and dispute scenarios as needed.

## Dependencies

Key dependencies listed in `package.json`:
- `@openzeppelin/contracts-upgradeable`: For upgradeable contract features.
- `@nomicfoundation/hardhat-toolbox`: Comprehensive Hardhat utilities.
- `ethers`: Ethereum JavaScript library.
- `chai`: Assertion library for testing.

## Contributing

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Commit your changes (`git commit -m "Add your feature"`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a pull request.

## License

This project is licensed under the MIT License - see the `SPDX-License-Identifier: MIT` in `YapBayEscrow.sol`.

## Related Repos
- [https://github.com/Panmoni/yapbay](https://github.com/Panmoni/yapbay)
- [https://github.com/Panmoni/yapbay-www](https://github.com/Panmoni/yapbay-www)
- [https://github.com/Panmoni/yapbay-contracts-sui](https://github.com/Panmoni/yapbay-contracts-sui)
- [https://github.com/Panmoni/yapbay-litepaper](https://github.com/Panmoni/yapbay-litepaper)
- [https://github.com/Panmoni/yapbay-contracts](https://github.com/Panmoni/yapbay-contracts) (old)