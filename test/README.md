# YapBayEscrow Contract Tests

This directory contains tests for the YapBayEscrow smart contract. The tests validate the functionality of the contract, including the recent enhancements for balance tracking and auto-cancellation eligibility.

## Test Files

- `YapBayEscrow.test.ts`: Main test file covering the core escrow functionality
- `YapBayEscrow.balance.test.ts`: Tests for balance tracking and the new query functions

## Running Tests

### Prerequisites

Before running the tests, make sure you have the following installed:

- **Node.js**: v16.x or higher
- **npm**: v8.x or higher

Install all dependencies:

```bash
npm install
```

### Environment Setup

Create a `.env` file in the root directory with the following:

```plaintext
ARBITRATOR_ADDRESS=<arbitrator-ethereum-address>
```

You can use a test address for local testing.

### Running All Tests

Use the provided test script to run all tests:

```bash
./scripts/run-tests.sh
```

This script will:
1. Compile the contracts
2. Run the main contract tests
3. Run the balance tracking tests

### Running Specific Tests

To run just the main tests:

```bash
npx hardhat test test/YapBayEscrow.test.ts
```

To run just the balance tests:

```bash
npx hardhat test test/YapBayEscrow.balance.test.ts
```

### Test Coverage

To generate a test coverage report:

```bash
./scripts/run-tests.sh --coverage
```

Or run the coverage command directly:

```bash
npx hardhat coverage
```

The coverage report will be generated in the `coverage/` directory and can be viewed by opening `coverage/index.html` in your browser.

## Time-dependent Tests

Many tests involve deadlines that would normally require waiting for real time to pass. We use Hardhat's time manipulation capabilities to simulate the passage of time:

```typescript
// Example: Advance time past the deposit deadline
await time.increase(DEPOSIT_DURATION + 1);
```

This approach allows testing time-dependent behavior without waiting for actual time to pass.

## Test Structure

The tests are organized into describe blocks based on functionality:

### Original Test File (`YapBayEscrow.test.ts`)
- **Initialization**: Tests for correct contract initialization
- **Escrow Creation**: Tests for creating standard and sequential escrows
- **Funding Escrow**: Tests for funding escrows
- **Marking Fiat as Paid**: Tests for marking fiat payment
- **Updating Sequential Address**: Tests for sequential address management
- **Releasing Escrow**: Tests for releasing funds
- **Cancelling Escrow**: Tests for cancellation
- **Dispute Handling**: Tests for dispute resolution
- **Auto-Cancellation**: Tests for auto-cancellation

### New Balance Test File (`YapBayEscrow.balance.test.ts`)
- **Balance Tracking**: Tests for balance tracking and event emissions
- **Balance Query Functions**: Tests for the `getStoredEscrowBalance` and `getCalculatedEscrowBalance` functions
- **Sequential Escrow Info**: Tests for the `getSequentialEscrowInfo` function
- **Auto-Cancel Eligibility**: Tests for the `isEligibleForAutoCancel` function
- **Balance Updates in Dispute Resolution**: Tests for balance updates during dispute resolution

## Constants

The tests use the following constants that match the contract's configuration:

- `DEPOSIT_DURATION`: 15 minutes in seconds
- `FIAT_DURATION`: 30 minutes in seconds
- `DISPUTE_RESPONSE_DURATION`: 72 hours in seconds
- `ARBITRATION_DURATION`: 7 days in seconds

These constants are crucial for testing time-dependent functionality.

## Troubleshooting

### Common Issues

1. **Missing Dependencies**:
   If you encounter errors about missing dependencies, run:
   ```bash
   npm install
   ```

2. **Compilation Errors**:
   If the contract fails to compile, ensure you have the correct version of solidity:
   ```bash
   npx hardhat compile --force
   ```

3. **Test Timeouts**:
   For tests involving time manipulation, if you encounter timeouts, try increasing the mocha timeout in `hardhat.config.ts`:
   ```typescript
   mocha: {
     timeout: 60000 // 60 seconds
   }
   ```

4. **TypeScript Errors**:
   If you encounter TypeScript errors related to the new functions:
   ```bash
   rm -rf typechain
   npx hardhat typechain
   ```

### Getting Help

If you encounter issues not covered here, please open an issue on the GitHub repository with a detailed description of the problem, including:

1. The error message and stack trace
2. Your environment (Node.js version, npm version, OS)
3. Steps to reproduce the issue