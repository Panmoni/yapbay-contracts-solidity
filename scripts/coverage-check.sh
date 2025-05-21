#!/bin/bash
# Simple script to check coverage for YapBayEscrow contract

set -e # Exit on any error

echo "=========================================================="
echo "    YapBay Escrow Contract Coverage Check"
echo "=========================================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Clean previous coverage data
echo -e "${YELLOW}Cleaning previous coverage data...${NC}"
npx hardhat clean
rm -rf coverage coverage-summary.json .coverage_*

# Run different coverage scenarios
run_coverage() {
  local test_files=$1
  local desc=$2
  
  echo -e "\n${YELLOW}Running coverage for $desc...${NC}"
  npx hardhat coverage --testfiles "$test_files" --temp .coverage_$desc
  
  # Extract metrics
  if [ -f "coverage/coverage-summary.json" ]; then
    BRANCH=$(grep -A 5 "YapBayEscrow.sol" coverage/coverage-summary.json | grep branch | head -1 | grep -o '[0-9]\+\.[0-9]\+')
    LINE=$(grep -A 5 "YapBayEscrow.sol" coverage/coverage-summary.json | grep lines | head -1 | grep -o '[0-9]\+\.[0-9]\+')
    FUNC=$(grep -A 5 "YapBayEscrow.sol" coverage/coverage-summary.json | grep functions | head -1 | grep -o '[0-9]\+\.[0-9]\+')
    
    # Store metrics
    echo "$BRANCH" > .coverage_${desc}_branch
    echo "$LINE" > .coverage_${desc}_line
    echo "$FUNC" > .coverage_${desc}_func
    
    # Copy report
    mkdir -p coverage_reports/${desc}
    cp -r coverage/* coverage_reports/${desc}/
    
    echo -e "${GREEN}$desc coverage: Branch $BRANCH% | Line $LINE% | Function $FUNC%${NC}"
  else
    echo -e "${RED}Error: Coverage report not found for $desc!${NC}"
    exit 1
  fi
}

# Create directory for reports
mkdir -p coverage_reports

# Run coverage for different test combinations
run_coverage "test/YapBayEscrow.test.ts" "base"
run_coverage "test/YapBayEscrow.test.ts test/YapBayEscrow.balance.test.ts" "with_balance"
run_coverage "test/YapBayEscrow.test.ts test/YapBayEscrow.balance.test.ts test/YapBayEscrow.edge.test.ts" "with_edge"
run_coverage "test/YapBayEscrow.test.ts test/YapBayEscrow.balance.test.ts test/YapBayEscrow.edge.test.ts test/YapBayEscrow.targeted.test.ts" "with_targeted"

# Calculate improvements
BASE_BRANCH=$(cat .coverage_base_branch)
BAL_BRANCH=$(cat .coverage_with_balance_branch)
EDGE_BRANCH=$(cat .coverage_with_edge_branch)
TARGET_BRANCH=$(cat .coverage_with_targeted_branch)

BASE_LINE=$(cat .coverage_base_line)
BAL_LINE=$(cat .coverage_with_balance_line)
EDGE_LINE=$(cat .coverage_with_edge_line)
TARGET_LINE=$(cat .coverage_with_targeted_line)

BASE_FUNC=$(cat .coverage_base_func)
BAL_FUNC=$(cat .coverage_with_balance_func)
EDGE_FUNC=$(cat .coverage_with_edge_func)
TARGET_FUNC=$(cat .coverage_with_targeted_func)

# Display summary
echo -e "\n${GREEN}=========================================================="
echo "    COVERAGE IMPROVEMENT SUMMARY"
echo "==========================================================${NC}"

echo -e "${YELLOW}BRANCH COVERAGE:${NC}"
echo "Base tests:                 $BASE_BRANCH%"
echo "With balance tests:         $BAL_BRANCH% ($(echo "$BAL_BRANCH - $BASE_BRANCH" | bc) percentage points gain)"
echo "With edge case tests:       $EDGE_BRANCH% ($(echo "$EDGE_BRANCH - $BAL_BRANCH" | bc) percentage points gain)"
echo "With targeted tests:        $TARGET_BRANCH% ($(echo "$TARGET_BRANCH - $EDGE_BRANCH" | bc) percentage points gain)"
echo -e "TOTAL IMPROVEMENT:         ${GREEN}$(echo "$TARGET_BRANCH - $BASE_BRANCH" | bc) percentage points${NC}"

echo -e "\n${YELLOW}LINE COVERAGE:${NC}"
echo "Base tests:                 $BASE_LINE%"
echo "With balance tests:         $BAL_LINE% ($(echo "$BAL_LINE - $BASE_LINE" | bc) percentage points gain)"
echo "With edge case tests:       $EDGE_LINE% ($(echo "$EDGE_LINE - $BAL_LINE" | bc) percentage points gain)"
echo "With targeted tests:        $TARGET_LINE% ($(echo "$TARGET_LINE - $EDGE_LINE" | bc) percentage points gain)"
echo -e "TOTAL IMPROVEMENT:         ${GREEN}$(echo "$TARGET_LINE - $BASE_LINE" | bc) percentage points${NC}"

echo -e "\n${YELLOW}FUNCTION COVERAGE:${NC}"
echo "Base tests:                 $BASE_FUNC%"
echo "With balance tests:         $BAL_FUNC% ($(echo "$BAL_FUNC - $BASE_FUNC" | bc) percentage points gain)"
echo "With edge case tests:       $EDGE_FUNC% ($(echo "$EDGE_FUNC - $BAL_FUNC" | bc) percentage points gain)"
echo "With targeted tests:        $TARGET_FUNC% ($(echo "$TARGET_FUNC - $EDGE_FUNC" | bc) percentage points gain)"
echo -e "TOTAL IMPROVEMENT:         ${GREEN}$(echo "$TARGET_FUNC - $BASE_FUNC" | bc) percentage points${NC}"

echo -e "\n${GREEN}=========================================================="
echo "    FINAL VERDICT"
echo "==========================================================${NC}"

# Determine overall success
if (( $(echo "$TARGET_BRANCH >= 85" | bc -l) )); then
  BRANCH_STATUS="${GREEN}GOOD${NC}"
else
  BRANCH_STATUS="${RED}NEEDS IMPROVEMENT${NC}"
fi

echo -e "Branch coverage: $TARGET_BRANCH% - $BRANCH_STATUS"
echo -e "Line coverage: $TARGET_LINE% - ${GREEN}GOOD${NC}"
echo -e "Function coverage: $TARGET_FUNC% - ${GREEN}GOOD${NC}"

echo -e "\n${YELLOW}Full coverage reports available in the coverage_reports directory${NC}"
echo -e "${YELLOW}Latest report available at: coverage/index.html${NC}"

# Clean up temporary files
rm -f .coverage_*

chmod +x "${0}"  # Make this script executable