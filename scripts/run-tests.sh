#!/bin/bash
# Run tests for YapBayEscrow smart contract

echo "==============================================="
echo "Running tests for YapBayEscrow smart contract"
echo "==============================================="

# Compile the contracts
echo "Compiling contracts..."
npx hardhat compile

if [ $? -ne 0 ]; then
    echo "Compilation failed. Exiting."
    exit 1
fi

# Run the existing tests
echo "Running existing contract tests..."
npx hardhat test test/YapBayEscrow.test.ts

if [ $? -ne 0 ]; then
    echo "Existing tests failed. Exiting."
    exit 1
fi

# Run the new balance tests
echo "Running balance tracking tests..."
npx hardhat test test/YapBayEscrow.balance.test.ts

if [ $? -ne 0 ]; then
    echo "Balance tracking tests failed. Exiting."
    exit 1
fi

# Run the edge case tests
echo "Running edge case tests..."
npx hardhat test test/YapBayEscrow.edge.test.ts

if [ $? -ne 0 ]; then
    echo "Edge case tests failed. Exiting."
    exit 1
fi

# Run the targeted tests for branch coverage
echo "Running targeted branch coverage tests..."
npx hardhat test test/YapBayEscrow.targeted.test.ts

if [ $? -ne 0 ]; then
    echo "Targeted tests failed. Exiting."
    exit 1
fi

# Run the edge case tests
echo "Running edge case tests..."
npx hardhat test test/YapBayEscrow.edge.test.ts

if [ $? -ne 0 ]; then
    echo "Edge case tests failed. Exiting."
    exit 1
fi

# If we've made it here, all tests passed
echo "==============================================="
echo "✅ All tests passed successfully!"
echo "==============================================="

# Run coverage if requested
if [ "$1" == "--coverage" ]; then
    echo "Generating coverage report..."
    npx hardhat coverage
    
    if [ $? -ne 0 ]; then
        echo "Coverage generation failed."
        exit 1
    fi
    
    echo "Coverage report generated."
fi

echo "Test run complete."