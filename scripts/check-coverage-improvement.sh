#!/bin/bash
# This script helps to analyze code coverage improvements between test suites

echo "============================================="
echo "YapBay Escrow Code Coverage Analysis"
echo "============================================="

# Create temporary directories to store coverage reports
mkdir -p coverage-base
mkdir -p coverage-improved

# Step 1: Run the original tests (base coverage)
echo "Step 1: Checking base coverage..."
npx hardhat clean
COVERAGE_OUTPUT_DIR="coverage-base" npx hardhat coverage --testfiles "test/YapBayEscrow.test.ts" --solcoverjs .solcover.base.js

# Step 2: Run with balance tests added (intermediate coverage)
echo "Step 2: Checking intermediate coverage (with balance tests)..."
npx hardhat clean
COVERAGE_OUTPUT_DIR="coverage-mid" npx hardhat coverage --testfiles "test/YapBayEscrow.test.ts test/YapBayEscrow.balance.test.ts" --solcoverjs .solcover.mid.js

# Step 3: Run with edge case tests added (full coverage)
echo "Step 3: Checking full coverage (with edge case tests)..."
npx hardhat clean
npx hardhat coverage --testfiles "test/YapBayEscrow.test.ts test/YapBayEscrow.balance.test.ts test/YapBayEscrow.edge.test.ts"

# Step 4: Generate coverage summary
echo "============================================="
echo "Coverage Summary:"
echo "============================================="

# Extract coverage numbers from the reports
BASE_BRANCH=$(grep -A 5 "File" coverage-base/coverage-summary.json | grep branch | head -1 | grep -o '[0-9]\+\.[0-9]\+')
MID_BRANCH=$(grep -A 5 "File" coverage-mid/coverage-summary.json | grep branch | head -1 | grep -o '[0-9]\+\.[0-9]\+')
FULL_BRANCH=$(grep -A 5 "File" coverage/coverage-summary.json | grep branch | head -1 | grep -o '[0-9]\+\.[0-9]\+')

BASE_LINE=$(grep -A 5 "File" coverage-base/coverage-summary.json | grep lines | head -1 | grep -o '[0-9]\+\.[0-9]\+')
MID_LINE=$(grep -A 5 "File" coverage-mid/coverage-summary.json | grep lines | head -1 | grep -o '[0-9]\+\.[0-9]\+')
FULL_LINE=$(grep -A 5 "File" coverage/coverage-summary.json | grep lines | head -1 | grep -o '[0-9]\+\.[0-9]\+')

BASE_FUNC=$(grep -A 5 "File" coverage-base/coverage-summary.json | grep functions | head -1 | grep -o '[0-9]\+\.[0-9]\+')
MID_FUNC=$(grep -A 5 "File" coverage-mid/coverage-summary.json | grep functions | head -1 | grep -o '[0-9]\+\.[0-9]\+')
FULL_FUNC=$(grep -A 5 "File" coverage/coverage-summary.json | grep functions | head -1 | grep -o '[0-9]\+\.[0-9]\+')

# Display results with improvements
echo "Branch Coverage:"
echo "  Base Tests:       ${BASE_BRANCH}%"
echo "  With Balance:     ${MID_BRANCH}% ($(echo "$MID_BRANCH - $BASE_BRANCH" | bc) improvement)"
echo "  With Edge Cases:  ${FULL_BRANCH}% ($(echo "$FULL_BRANCH - $MID_BRANCH" | bc) improvement)"
echo "  Total Gain:       $(echo "$FULL_BRANCH - $BASE_BRANCH" | bc) percentage points"
echo ""

echo "Line Coverage:"
echo "  Base Tests:       ${BASE_LINE}%"
echo "  With Balance:     ${MID_LINE}% ($(echo "$MID_LINE - $BASE_LINE" | bc) improvement)"
echo "  With Edge Cases:  ${FULL_LINE}% ($(echo "$FULL_LINE - $MID_LINE" | bc) improvement)"
echo "  Total Gain:       $(echo "$FULL_LINE - $BASE_LINE" | bc) percentage points"
echo ""

echo "Function Coverage:"
echo "  Base Tests:       ${BASE_FUNC}%"
echo "  With Balance:     ${MID_FUNC}% ($(echo "$MID_FUNC - $BASE_FUNC" | bc) improvement)"
echo "  With Edge Cases:  ${FULL_FUNC}% ($(echo "$FULL_FUNC - $MID_FUNC" | bc) improvement)"
echo "  Total Gain:       $(echo "$FULL_FUNC - $BASE_FUNC" | bc) percentage points"
echo ""

echo "Full coverage report is available in the coverage directory"
echo "============================================="

# Create .solcover config files if they don't exist
cat > .solcover.base.js << EOF
module.exports = {
  skipFiles: [],
  istanbulReporter: ['html', 'json', 'json-summary'],
  mocha: {
    timeout: 100000
  }
};
EOF

cat > .solcover.mid.js << EOF
module.exports = {
  skipFiles: [],
  istanbulReporter: ['html', 'json', 'json-summary'],
  mocha: {
    timeout: 100000
  }
};
EOF

chmod +x "${0}"  # Make this script executable

echo "Done!"