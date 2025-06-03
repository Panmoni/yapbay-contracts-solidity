# Notes

## Ref
### check balance
npx hardhat check-balance --network alfajores
npx hardhat check-balance --network celo

### compile
npx hardhat compile

### deploy on mainnet
npx hardhat run scripts/deploy_mainnet.js --network celo

### deploy on testnet
npx hardhat run scripts/deploy.ts --network alfajores

### verify
npx hardhat verify --network celo <proxy_address>
npx hardhat verify --network celo <implementation_address>

### test
npx hardhat console --network alfajores
npx hardhat console --network celo

### Upgrade
npx hardhat run scripts/upgrade_contract.js --network celo
npx hardhat run scripts/upgrade_contract.js --network alfajores
