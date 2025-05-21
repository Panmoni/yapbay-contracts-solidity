#!/bin/bash
# Script to check code coverage for YapBayEscrow contract

echo "====================================================="
echo "YapBay Escrow Contract Coverage Analysis"
echo "====================================================="

# Step 1: Clean any previous coverage data
echo "Cleaning previous coverage data..."
npx hardhat clean
rm -rf coverage coverage-summary.json

# Step 2: Run coverage with all test files
echo "Running coverage analysis with all tests..."
npx hardhat coverage

# Step 3: Show coverage summary
echo "====================================================="
echo "Coverage Summary:"
echo "====================================================="

# Check if coverage-summary.json exists
if [ -f "coverage/coverage-summary.json" ]; then
  # Extract branch, line, and function coverage
  BRANCH_COV=$(grep -A 5 "YapBayEscrow.sol" coverage/coverage-summary.json | grep branch | head -1 | grep -o '[0-9]\+\.[0-9]\+')
  LINE_COV=$(grep -A 5 "YapBayEscrow.sol" coverage/coverage-summary.json | grep lines | head -1 | grep -o '[0-9]\+\.[0-9]\+')
  FUNC_COV=$(grep -A 5 "YapBayEscrow.sol" coverage/coverage-summary.json | grep functions | head -1 | grep -o '[0-9]\+\.[0-9]\+')
  
  # Display coverage metrics
  echo "Branch Coverage: ${BRANCH_COV}%"
  echo "Line Coverage:   ${LINE_COV}%"
  echo "Function Coverage: ${FUNC_COV}%"
  
  # List any uncovered lines/branches if below certain thresholds
  if (( $(echo "$BRANCH_COV < 90" | bc -l) )); then
    echo ""
    echo "Branch coverage is below 90%. Uncovered branches:"
    grep -A 20 "uncovered-lines" coverage/coverage-summary.json | grep -A 20 "YapBayEscrow.sol"
  fi
else
  echo "Error: Coverage report not found!"
  exit 1
fi

echo "====================================================="
echo "Full coverage report available at: coverage/index.html"
echo "====================================================="