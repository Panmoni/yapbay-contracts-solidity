Great! Now that it's deployed and verified, you can test the core escrow flow. Here are a few ways:

https://alfajores.celoscan.io/address/0xC8BFB8a31fFbAF5c85bD97a1728aC43418B5871C#readProxyContract

**1. Using CeloScan (Manual Testing):**

This is good for quick, visual checks of individual functions. You'll use the "Write as Proxy" tab on the CeloScan page for your proxy contract (`0xC8BF...871C`).

*   **Prerequisites:**
    *   **Connect Wallet:** Connect your wallet (e.g., MetaMask configured for Alfajores) to CeloScan using the "Connect to Web3" button. Ensure you're connected with the **Seller** account (`0x6d2d...0383`, the deployer/owner/arbitrator in this case).
    *   **Buyer Address:** You'll need another Alfajores address to act as the Buyer. You can create a new account in MetaMask for this.
    *   **Testnet USDC:** The Seller account needs some Alfajores USDC (`0x2F25...602B`) to fund the escrow. You might need to use a faucet or a swap service (like Ubeswap on Alfajores) to get some test USDC.

*   **Testing `createEscrow`:**
    1.  Go to the "Write as Proxy" tab on CeloScan for `0xC8BF...871C`.
    2.  Find the `createEscrow` function.
    3.  Fill in the parameters:
        *   `_tradeId` (payableAmount: 0): A unique number for your test trade (e.g., `123`).
        *   `_buyer` (address): The Alfajores address of your test Buyer account.
        *   `_amount` (uint256): The amount of USDC in its smallest unit (6 decimals). For example, 10 USDC would be `10000000`. Remember the contract has a `MAX_AMOUNT` of 100 USDC.
        *   `_sequential` (bool): `false` for a standard escrow test.
        *   `_sequentialEscrowAddress` (address): `0x0000000000000000000000000000000000000000` (the zero address) if `_sequential` is false.
    4.  Click "Write" and approve the transaction in your wallet.
    5.  Check the transaction on CeloScan. You can then use the "Read as Proxy" tab to check the state of the newly created escrow using the `escrows` mapping (input the `escrowId`, which starts at 1).

*   **Next Steps (via CeloScan):**
    *   **Fund:** Call `fundEscrow` (requires the Seller to approve the contract to spend their USDC first, then call `fundEscrow`).
    *   **Mark Paid:** Connect CeloScan with the **Buyer's** wallet and call `markFiatPaid`.
    *   **Release:** Connect back with the **Seller's** wallet and call `releaseEscrow`.

**2. Using Hardhat Scripts/Tasks (Automated Testing):**

This is better for repeatable tests or more complex scenarios. You already have a test file (`test/YapBayEscrow.test.ts`) which likely contains tests for the local Hardhat network. You could adapt parts of this or create new scripts specifically for interacting with the deployed contract on Alfajores.

*   **Example Script Idea:** Create a script `scripts/interact.ts` that gets the deployed contract instance and calls functions like `createEscrow`, `fundEscrow`, etc., using specific addresses and amounts. You'd run it like `npx hardhat run scripts/interact.ts --network alfajores`.

**Recommendation:**

Start by testing the `createEscrow` flow manually using **CeloScan** as described above. It's the most direct way to interact with the deployed contract right now. Once you're comfortable with that, you can explore writing Hardhat scripts for more complex or automated testing if needed.

Let me know if you'd like help writing a simple Hardhat interaction script!