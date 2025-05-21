# Notes

re-deploy fresh to avoid escrow id conflicts

## implement backend monitoring service to ensure funds are not getting stranded in escrows

## Roadmap
- security audit Slither or Mythril
- gas optimization
- test for common security issues

## Ref
https://docs.celo.org/

### Upgrade
1. make changes
2. npx hardhat compile
3. npx hardhat run scripts/upgrade_contract.js --network celo
4. verify

#### initialize new vars?

f your new contract version adds state variables that need to be set up, you'll need to:
Add a new initializer function (e.g., initializeV2(...) or configureNewFeature(...)) in your contract.
Uncomment and use the call option within the upgrades.upgradeProxy(...) function in scripts/upgrade_contract.js to invoke this new initializer during the upgrade process.

### Deployed on Mainnet
npx hardhat compile

npx hardhat run scripts/deploy_mainnet.js --network celo

### Deployed on Alfajores

https://alfajores.celoscan.io/address/0xC8BFB8a31fFbAF5c85bD97a1728aC43418B5871C#code
https://alfajores.celoscan.io/address/0x7A7a657a04EA42F3a8168450eFC46203c363a4Cd#code

npx hardhat verify --network alfajores 0xC8BFB8a31fFbAF5c85bD97a1728aC43418B5871C


0xC8BFB8a31fFbAF5c85bD97a1728aC43418B5871C
