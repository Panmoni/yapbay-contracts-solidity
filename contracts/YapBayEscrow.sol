// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

// USDC on Celo: 0xcebA9300f2b948710d2653dD7B07f33A8B32118C
// Alfajores testnet via https://alfajores-forno.celo-testnet.org
// https://celoscan.io/

// Import OpenZeppelin upgradeable libraries
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/*
  YapBayEscrow is an upgradeable on-chain escrow that supports standard and
  sequential (chained remittance) trades with integrated dispute management.

  Roles:
    • Seller – creates and funds an escrow.
    • Buyer – confirms fiat payment on-chain.
    • Arbitrator – a fixed address (set at initialization) that may resolve disputes or trigger auto‑cancellation.

  The contract uses USDC only (with a maximum of 100 USDC per escrow) and enforces two deadlines:
    • Deposit deadline: 15 minutes after creation.
    • Fiat payment deadline: 30 minutes after funding.

  Disputes require each party to post a 5% bond and submit a SHA‑256 evidence hash.
  
  Balance Tracking:
    • Each escrow's balance is tracked in a dedicated mapping (escrowBalances).
    • Balances are updated when funds are moved (funding, releasing, cancellation, dispute resolution).
    • Balance changes are logged through EscrowBalanceChanged events.
    • Sequential escrows have special handling - the funds are transferred to another escrow address.
    • Use getStoredEscrowBalance() to get the current tracked balance.
    • Use getCalculatedEscrowBalance() to get the expected balance based on escrow state.
    • Use getSequentialEscrowInfo() to query information about sequential escrows.
*/
contract YapBayEscrow is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // -------------------------------
    // Structures and Enumerations
    // -------------------------------
    enum EscrowState {
        Created,
        Funded,
        Released,
        Cancelled,
        Disputed,
        Resolved
    }

    struct Escrow {
        // Base fields
        uint256 escrow_id;
        uint256 trade_id;
        address seller;
        address buyer;
        address arbitrator;
        uint256 amount; // amount in USDC smallest unit (e.g. 6 decimals)
        uint256 deposit_deadline; // timestamp deadline for deposit (15min after creation)
        uint256 fiat_deadline; // timestamp deadline for fiat confirmation (set at funding)
        EscrowState state;
        bool sequential;
        address sequential_escrow_address;
        bool fiat_paid;
        uint256 counter; // audit counter (increments on each state transition)
        // Dispute-related fields (initially zero)
        address dispute_initiator;
        uint256 dispute_bond_buyer;
        uint256 dispute_bond_seller;
        uint256 dispute_initiated_time;
        bytes32 dispute_evidence_hash_buyer;
        bytes32 dispute_evidence_hash_seller;
        bytes32 dispute_resolution_hash;
    }

    // -------------------------------
    // State Variables and Constants
    // -------------------------------
    uint256 public nextEscrowId; // auto-incrementing escrow id
    mapping(uint256 => Escrow) public escrows; // stores all escrow data by escrow ID
    mapping(uint256 => uint256) public escrowBalances; // tracks the current balance of each escrow

    IERC20Upgradeable public usdc;
    address public fixedArbitrator;
    string public constant VERSION = "0.1.2"; // Contract version

    // Constants (USDC assumed to have 6 decimals)
    uint256 public constant MAX_AMOUNT = 100 * (10 ** 6); // 100 USDC maximum
    uint256 public constant DEPOSIT_DURATION = 15 * 60; // 15 minutes in seconds
    uint256 public constant FIAT_DURATION = 30 * 60; // 30 minutes in seconds
    uint256 public constant DISPUTE_RESPONSE_DURATION = 72 * 3600; // 72 hours in seconds
    uint256 public constant ARBITRATION_DURATION = 168 * 3600; // 168 hours (7 days) in seconds

    // -------------------------------
    // Events
    // All events include relevant information for off-chain tracking
    // -------------------------------
    event EscrowCreated(
        uint256 indexed escrowId,
        uint256 indexed tradeId,
        address seller,
        address buyer,
        address arbitrator,
        uint256 amount,
        uint256 deposit_deadline,
        uint256 fiat_deadline,
        bool sequential,
        address sequentialEscrowAddress,
        uint256 timestamp,
        string version
    );

    event FundsDeposited(
        uint256 indexed escrowId,
        uint256 indexed tradeId,
        uint256 amount,
        uint256 counter,
        uint256 timestamp
    );

    event FiatMarkedPaid(
        uint256 indexed escrowId,
        uint256 indexed tradeId,
        uint256 timestamp
    );

    event SequentialAddressUpdated(
        uint256 indexed escrowId,
        address oldAddress,
        address newAddress,
        uint256 timestamp
    );

    event EscrowReleased(
        uint256 indexed escrowId,
        uint256 indexed tradeId,
        address buyer,
        uint256 amount,
        uint256 counter,
        uint256 timestamp,
        string destination
    );

    event EscrowCancelled(
        uint256 indexed escrowId,
        uint256 indexed tradeId,
        address seller,
        uint256 amount,
        uint256 counter,
        uint256 timestamp
    );

    event DisputeOpened(
        uint256 indexed escrowId,
        uint256 indexed tradeId,
        address initiator,
        uint256 bondAmount,
        uint256 timestamp
    );

    event DisputeResponse(
        uint256 indexed escrowId,
        address responder,
        uint256 bondAmount,
        bytes32 evidenceHash
    );

    event DisputeResolved(
        uint256 indexed escrowId,
        bool decision, // true means buyer wins; false means seller wins
        bytes32 explanationHash,
        string bondAllocation
    );

    event EscrowBalanceChanged(
        uint256 indexed escrowId,
        uint256 newBalance,
        string reason
    );

    // -------------------------------
    // Initializer (instead of constructor)
    // -------------------------------
    function initialize(
        IERC20Upgradeable _usdc,
        address _arbitrator
    ) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        require(address(_usdc) != address(0), "Invalid USDC address");
        require(_arbitrator != address(0), "E102: Invalid arbitrator address");
        usdc = _usdc;
        fixedArbitrator = _arbitrator;
        nextEscrowId = 1;
    }

    // -------------------------------
    // A. Escrow Creation
    // -------------------------------
    /// @notice Called by the seller to create a new escrow.
    /// @param _tradeId Off‐chain trade identifier (e.g. 4500 for leg1).
    /// @param _buyer The address of the Buyer.
    /// @param _amount The amount (in USDC's smallest unit) to be escrowed (must be nonzero and ≤ MAX_AMOUNT).
    /// @param _sequential True if this is part of a chained remittance trade.
    /// @param _sequentialEscrowAddress If sequential, the Buyer's pre‐created leg2 escrow address.
    /// @return The new escrow id.
    function createEscrow(
        uint256 _tradeId,
        address _buyer,
        uint256 _amount,
        bool _sequential,
        address _sequentialEscrowAddress
    ) external whenNotPaused returns (uint256) {
        require(_amount > 0, "E100: Invalid amount");
        require(_amount <= MAX_AMOUNT, "E101: Amount exceeds maximum limit");
        require(_buyer != address(0), "E102: Invalid buyer address");
        if (_sequential) {
            require(
                _sequentialEscrowAddress != address(0),
                "E106: Missing sequential escrow address"
            );
        }
        Escrow memory newEscrow;
        newEscrow.escrow_id = nextEscrowId;
        newEscrow.trade_id = _tradeId;
        newEscrow.seller = msg.sender;
        newEscrow.buyer = _buyer;
        newEscrow.arbitrator = fixedArbitrator;
        newEscrow.amount = _amount;
        newEscrow.deposit_deadline = block.timestamp + DEPOSIT_DURATION;
        newEscrow.fiat_deadline = 0; // to be set at funding
        newEscrow.state = EscrowState.Created;
        newEscrow.sequential = _sequential;
        newEscrow.sequential_escrow_address = _sequential
            ? _sequentialEscrowAddress
            : address(0);
        newEscrow.fiat_paid = false;
        newEscrow.counter = 0;

        escrows[nextEscrowId] = newEscrow;
        emit EscrowCreated(
            nextEscrowId,
            _tradeId,
            msg.sender,
            _buyer,
            fixedArbitrator,
            _amount,
            newEscrow.deposit_deadline,
            newEscrow.fiat_deadline,
            _sequential,
            newEscrow.sequential_escrow_address,
            block.timestamp,
            VERSION
        );
        nextEscrowId++;
        return newEscrow.escrow_id;
    }

    // -------------------------------
    // B. Funding the Escrow
    // -------------------------------
    /// @notice Called by the seller to fund an escrow (in state Created).
    /// @param _escrowId The escrow identifier.
    function fundEscrow(uint256 _escrowId) external nonReentrant whenNotPaused {
        Escrow storage escrow = escrows[_escrowId];
        require(
            escrow.state == EscrowState.Created,
            "E105: Invalid state transition"
        );
        require(msg.sender == escrow.seller, "E102: Unauthorized caller");
        require(
            block.timestamp <= escrow.deposit_deadline,
            "E103: Deposit deadline expired"
        );

        // Use SafeERC20Upgradeable for token transfer
        usdc.safeTransferFrom(msg.sender, address(this), escrow.amount);

        // Track the balance in our internal mapping
        escrowBalances[_escrowId] = escrow.amount;

        // Update escrow state to Funded and set the fiat payment deadline
        escrow.state = EscrowState.Funded;
        escrow.fiat_deadline = block.timestamp + FIAT_DURATION;
        escrow.counter++; // Increment audit counter for tracking state changes
        emit FundsDeposited(
            _escrowId,
            escrow.trade_id,
            escrow.amount,
            escrow.counter,
            block.timestamp
        );
        emit EscrowBalanceChanged(_escrowId, escrow.amount, "Escrow funded");
    }

    // -------------------------------
    // C. Marking Fiat as Paid
    // -------------------------------
    /// @notice Called by the Buyer to mark fiat as paid (only when escrow is Funded).
    /// @param _escrowId The escrow identifier.
    function markFiatPaid(uint256 _escrowId) external whenNotPaused {
        Escrow storage escrow = escrows[_escrowId];
        require(
            escrow.state == EscrowState.Funded,
            "E105: Invalid state transition"
        );
        require(msg.sender == escrow.buyer, "E102: Unauthorized caller");
        require(
            block.timestamp <= escrow.fiat_deadline,
            "E104: Fiat payment deadline expired"
        );

        escrow.fiat_paid = true;
        emit FiatMarkedPaid(_escrowId, escrow.trade_id, block.timestamp);
    }

    // -------------------------------
    // D. Updating the Sequential Escrow Address
    // -------------------------------
    /// @notice If the escrow is sequential, the Buyer can update the leg2 address.
    /// @param _escrowId The escrow identifier.
    /// @param newSequentialAddress The new sequential escrow address.
    function updateSequentialAddress(
        uint256 _escrowId,
        address newSequentialAddress
    ) external whenNotPaused {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.sequential, "E106: Escrow is not sequential");
        require(
            escrow.state != EscrowState.Released &&
                escrow.state != EscrowState.Cancelled &&
                escrow.state != EscrowState.Resolved,
            "E107: Escrow in terminal state"
        );
        require(msg.sender == escrow.buyer, "E102: Unauthorized caller");
        require(
            newSequentialAddress != address(0),
            "E102: Invalid sequential address"
        );

        address oldAddress = escrow.sequential_escrow_address;
        escrow.sequential_escrow_address = newSequentialAddress;
        emit SequentialAddressUpdated(
            _escrowId,
            oldAddress,
            newSequentialAddress,
            block.timestamp
        );
    }

    // -------------------------------
    // E. Releasing the Escrow
    // -------------------------------
    /// @notice Releases funds once fiat is confirmed.
    ///         – For standard trades, funds go to the Buyer.
    ///         – For sequential trades, funds go to the designated sequential escrow address.
    /// @param _escrowId The escrow identifier.
    function releaseEscrow(
        uint256 _escrowId
    ) external nonReentrant whenNotPaused {
        Escrow storage escrow = escrows[_escrowId];
        require(
            escrow.state == EscrowState.Funded,
            "E105: Invalid state transition"
        );
        // Only the Seller (if fiat confirmed) or arbitrator may trigger a release.
        require(
            (msg.sender == escrow.seller && escrow.fiat_paid) ||
                msg.sender == fixedArbitrator,
            "E102: Unauthorized caller or fiat not confirmed"
        );
        if (escrow.sequential) {
            require(
                escrow.sequential_escrow_address != address(0),
                "E106: Missing sequential escrow address"
            );
        }

        // Update escrow state to Released
        escrow.state = EscrowState.Released;
        escrow.counter++; // Increment audit counter for tracking state changes

        // Reset tracked balance as funds are being transferred out
        escrowBalances[_escrowId] = 0;

        if (escrow.sequential) {
            // Transfer funds to the sequential escrow address
            usdc.safeTransfer(escrow.sequential_escrow_address, escrow.amount);
            // Note: We don't update escrowBalances for the sequential escrow here
            // as that would require knowing its escrow_id. Instead, we rely on
            // that escrow's own funding mechanism to track its balance.
            emit EscrowReleased(
                _escrowId,
                escrow.trade_id,
                escrow.buyer,
                escrow.amount,
                escrow.counter,
                block.timestamp,
                "sequential escrow"
            );
        } else {
            usdc.safeTransfer(escrow.buyer, escrow.amount);
            emit EscrowReleased(
                _escrowId,
                escrow.trade_id,
                escrow.buyer,
                escrow.amount,
                escrow.counter,
                block.timestamp,
                "direct to buyer"
            );
        }
        emit EscrowBalanceChanged(_escrowId, 0, "Escrow released");
    }

    // -------------------------------
    // F. Cancelling the Escrow
    // -------------------------------
    /// @notice Cancels the escrow.
    ///         – In state Created, cancellation is possible if the deposit deadline expired.
    ///         – In state Funded, allowed only if fiat is not yet confirmed and the fiat deadline expired.
    /// @param _escrowId The escrow identifier.
    function cancelEscrow(
        uint256 _escrowId
    ) external nonReentrant whenNotPaused {
        Escrow storage escrow = escrows[_escrowId];
        require(
            escrow.state == EscrowState.Created ||
                escrow.state == EscrowState.Funded,
            "E105: Invalid state transition"
        );
        require(
            msg.sender == escrow.seller || msg.sender == fixedArbitrator,
            "E102: Unauthorized caller"
        );

        if (escrow.state == EscrowState.Created) {
            require(
                block.timestamp > escrow.deposit_deadline,
                "Cannot cancel: deposit deadline not expired"
            );
        }
        if (escrow.state == EscrowState.Funded) {
            require(
                !escrow.fiat_paid,
                "E105: Fiat already confirmed, cannot cancel"
            );
            require(
                block.timestamp > escrow.fiat_deadline,
                "Cannot cancel: fiat deadline not expired"
            );
            // Refund funds to Seller.
            usdc.safeTransfer(escrow.seller, escrow.amount);
            // Reset tracked balance as funds are being transferred out
            escrowBalances[_escrowId] = 0;
            emit EscrowBalanceChanged(_escrowId, 0, "Escrow cancelled");
        }

        escrow.state = EscrowState.Cancelled;
        escrow.counter++;
        emit EscrowCancelled(
            _escrowId,
            escrow.trade_id,
            escrow.seller,
            escrow.amount,
            escrow.counter,
            block.timestamp
        );
    }

    // -------------------------------
    // G. Dispute Handling
    // -------------------------------
    // 1. Dispute Initiation
    /// @notice Called by either party (buyer or seller) to open a dispute (only after fiat_paid is true).
    ///         The caller must post a 5% bond and provide an evidence hash.
    /// @param _escrowId The escrow identifier.
    /// @param evidenceHash The SHA‑256 hash of the dispute evidence.
    function openDisputeWithBond(
        uint256 _escrowId,
        bytes32 evidenceHash
    ) external nonReentrant whenNotPaused {
        Escrow storage escrow = escrows[_escrowId];
        require(
            escrow.state == EscrowState.Funded,
            "E105: Invalid state transition"
        );
        require(escrow.fiat_paid, "Fiat must be confirmed before dispute");
        require(
            msg.sender == escrow.seller || msg.sender == escrow.buyer,
            "E102: Unauthorized caller"
        );
        require(
            escrow.dispute_initiator == address(0),
            "Dispute already initiated"
        );

        uint256 bondAmount = (escrow.amount * 5) / 100;
        usdc.safeTransferFrom(msg.sender, address(this), bondAmount);
        escrow.dispute_initiated_time = block.timestamp;
        escrow.dispute_initiator = msg.sender;
        if (msg.sender == escrow.buyer) {
            escrow.dispute_bond_buyer = bondAmount;
            escrow.dispute_evidence_hash_buyer = evidenceHash;
        } else {
            escrow.dispute_bond_seller = bondAmount;
            escrow.dispute_evidence_hash_seller = evidenceHash;
        }
        // Note: We don't update escrowBalances here as the bond is separate from the escrow amount
        escrow.state = EscrowState.Disputed;
        escrow.counter++;
        emit DisputeOpened(
            _escrowId,
            escrow.trade_id,
            msg.sender,
            bondAmount,
            block.timestamp
        );
    }

    // 2. Dispute Response
    /// @notice Called by the opposing party to respond to a dispute within 72 hours.
    ///         The responder must post the same 5% bond and an evidence hash.
    /// @param _escrowId The escrow identifier.
    /// @param evidenceHash The SHA‑256 hash of the responder's evidence.
    function respondToDisputeWithBond(
        uint256 _escrowId,
        bytes32 evidenceHash
    ) external nonReentrant whenNotPaused {
        Escrow storage escrow = escrows[_escrowId];
        require(
            escrow.state == EscrowState.Disputed,
            "E105: Invalid state transition"
        );

        // If dispute was initiated by buyer then the responder must be seller and vice-versa
        if (escrow.dispute_initiator == escrow.buyer) {
            require(msg.sender == escrow.seller, "E102: Unauthorized caller");
            require(
                escrow.dispute_evidence_hash_seller == bytes32(0),
                "Dispute already responded by seller"
            );
        } else if (escrow.dispute_initiator == escrow.seller) {
            require(msg.sender == escrow.buyer, "E102: Unauthorized caller");
            require(
                escrow.dispute_evidence_hash_buyer == bytes32(0),
                "Dispute already responded by buyer"
            );
        } else {
            revert("E102: Invalid dispute initiator");
        }
        require(
            block.timestamp <=
                escrow.dispute_initiated_time + DISPUTE_RESPONSE_DURATION,
            "E111: Dispute response period expired"
        );
        uint256 bondAmount = (escrow.amount * 5) / 100;
        usdc.safeTransferFrom(msg.sender, address(this), bondAmount);
        if (msg.sender == escrow.buyer) {
            escrow.dispute_bond_buyer = bondAmount;
            escrow.dispute_evidence_hash_buyer = evidenceHash;
        } else {
            escrow.dispute_bond_seller = bondAmount;
            escrow.dispute_evidence_hash_seller = evidenceHash;
        }
        // Note: We don't update escrowBalances here as the bond is separate from the escrow amount
        emit DisputeResponse(_escrowId, msg.sender, bondAmount, evidenceHash);
    }

    // 3. Default Judgment
    /// @notice Called by the arbitrator if the opposing party fails to respond within 72 hours.
    ///         The function transfers funds according to the default outcome and clears the escrow balance.
    /// @param _escrowId The escrow identifier.
    function defaultJudgment(
        uint256 _escrowId
    ) external nonReentrant whenNotPaused {
        require(msg.sender == fixedArbitrator, "E102: Unauthorized caller");
        Escrow storage escrow = escrows[_escrowId];
        require(
            escrow.state == EscrowState.Disputed,
            "E105: Invalid state transition"
        );
        require(
            block.timestamp >=
                escrow.dispute_initiated_time + DISPUTE_RESPONSE_DURATION,
            "Response period not expired"
        );

        address winner;
        string memory judgment;
        // Decide based on which party did NOT respond.
        if (
            escrow.dispute_initiator == escrow.buyer &&
            escrow.dispute_evidence_hash_seller == bytes32(0)
        ) {
            winner = escrow.buyer;
            judgment = "Buyer wins by default";
            if (escrow.sequential) {
                // Transfer funds to the sequential escrow address
                usdc.safeTransfer(
                    escrow.sequential_escrow_address,
                    escrow.amount
                );
                // Note: We don't update the sequential escrow's balance here
            } else {
                usdc.safeTransfer(escrow.buyer, escrow.amount);
            }
            if (escrow.dispute_bond_buyer > 0) {
                usdc.safeTransfer(escrow.buyer, escrow.dispute_bond_buyer);
            }
            if (escrow.dispute_bond_seller > 0) {
                usdc.safeTransfer(fixedArbitrator, escrow.dispute_bond_seller);
            }
            // Note: This is a sequential escrow transfer and we don't update the target's balance
        } else if (
            escrow.dispute_initiator == escrow.seller &&
            escrow.dispute_evidence_hash_buyer == bytes32(0)
        ) {
            winner = escrow.seller;
            judgment = "Seller wins by default";
            usdc.safeTransfer(escrow.seller, escrow.amount);
            if (escrow.dispute_bond_seller > 0) {
                usdc.safeTransfer(escrow.seller, escrow.dispute_bond_seller);
            }
            if (escrow.dispute_bond_buyer > 0) {
                usdc.safeTransfer(fixedArbitrator, escrow.dispute_bond_buyer);
            }
        } else {
            revert("Cannot apply default judgment when both parties responded");
        }
        // Reset escrow balance as funds are being transferred out
        escrowBalances[_escrowId] = 0;
        escrow.state = EscrowState.Resolved;
        escrow.counter++;
        emit DisputeResolved(
            _escrowId,
            winner == escrow.buyer,
            bytes32(0),
            judgment
        );
        emit EscrowBalanceChanged(
            _escrowId,
            0,
            "Dispute resolved by default judgment"
        );
    }

    // 4. Arbitration Process
    /// @notice Called by the arbitrator to resolve a dispute with an explanation.
    ///         The decision (true means funds released, false means cancellation)
    ///         determines funds and bond allocation. Also clears the escrow balance tracking.
    /// @param _escrowId The escrow identifier.
    /// @param decision Arbitrator's decision (true: Buyer wins; false: Seller wins).
    /// @param explanationHash The SHA‑256 hash of the written arbitration explanation.
    function resolveDisputeWithExplanation(
        uint256 _escrowId,
        bool decision,
        bytes32 explanationHash
    ) external nonReentrant whenNotPaused {
        require(msg.sender == fixedArbitrator, "E102: Unauthorized caller");
        Escrow storage escrow = escrows[_escrowId];
        require(
            escrow.state == EscrowState.Disputed,
            "E105: Invalid state transition"
        );
        require(
            block.timestamp <=
                escrow.dispute_initiated_time +
                    DISPUTE_RESPONSE_DURATION +
                    ARBITRATION_DURATION,
            "E113: Arbitration deadline exceeded"
        );
        escrow.dispute_resolution_hash = explanationHash;
        string memory bondAllocation;

        if (decision) {
            // Buyer wins – transfer funds to buyer (or sequential escrow address).
            if (escrow.sequential) {
                // Transfer funds to the sequential escrow address
                usdc.safeTransfer(
                    escrow.sequential_escrow_address,
                    escrow.amount
                );
                // Note: We don't update the sequential escrow's balance here
            } else {
                usdc.safeTransfer(escrow.buyer, escrow.amount);
            }
            if (escrow.dispute_bond_buyer > 0) {
                usdc.safeTransfer(escrow.buyer, escrow.dispute_bond_buyer);
            }
            if (escrow.dispute_bond_seller > 0) {
                usdc.safeTransfer(fixedArbitrator, escrow.dispute_bond_seller);
            }
            bondAllocation = "Buyer wins: buyer bond returned, seller bond to arbitrator";
        } else {
            // Seller wins – refund escrow funds to seller.
            usdc.safeTransfer(escrow.seller, escrow.amount);
            if (escrow.dispute_bond_seller > 0) {
                usdc.safeTransfer(escrow.seller, escrow.dispute_bond_seller);
            }
            if (escrow.dispute_bond_buyer > 0) {
                usdc.safeTransfer(fixedArbitrator, escrow.dispute_bond_buyer);
            }
            bondAllocation = "Seller wins: seller bond returned, buyer bond to arbitrator";
        }
        // Reset escrow balance as funds are being transferred out
        escrowBalances[_escrowId] = 0;
        escrow.state = EscrowState.Resolved;
        escrow.counter++;
        emit DisputeResolved(
            _escrowId,
            decision,
            explanationHash,
            bondAllocation
        );
        emit EscrowBalanceChanged(
            _escrowId,
            0,
            "Dispute resolved by arbitration"
        );
    }

    // -------------------------------
    // H. Auto-Cancellation on Deadline
    // -------------------------------
    // UUPS Upgradeability function
    /// @notice Authorizes an upgrade to a new implementation
    /// @dev Required by the UUPS pattern, only callable by the owner
    /// @param newImplementation Address of the new implementation contract
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    /// @notice Called by the arbitrator to auto-cancel an escrow when deadlines are exceeded
    /// @dev For escrows still in Created (if deposit deadline passed) or Funded (fiat not confirmed
    ///      and fiat deadline passed)

    function autoCancel(uint256 _escrowId) external nonReentrant whenNotPaused {
        require(msg.sender == fixedArbitrator, "E102: Unauthorized caller");
        Escrow storage escrow = escrows[_escrowId];
        require(
            escrow.state != EscrowState.Released &&
                escrow.state != EscrowState.Cancelled &&
                escrow.state != EscrowState.Resolved,
            "E107: Escrow in terminal state"
        );

        if (escrow.state == EscrowState.Created) {
            require(
                block.timestamp > escrow.deposit_deadline,
                "Deposit deadline not expired"
            );
        }
        if (escrow.state == EscrowState.Funded) {
            require(!escrow.fiat_paid, "Fiat already paid; cannot auto-cancel");
            require(
                block.timestamp > escrow.fiat_deadline,
                "Fiat deadline not expired"
            );
            usdc.safeTransfer(escrow.seller, escrow.amount);
            // Reset tracked balance as funds are being transferred out
            escrowBalances[_escrowId] = 0;
            emit EscrowBalanceChanged(_escrowId, 0, "Escrow cancelled");
        }
        // Update escrow state to Cancelled
        escrow.state = EscrowState.Cancelled;
        escrow.counter++; // Increment audit counter for tracking state changes
        emit EscrowCancelled(
            _escrowId,
            escrow.trade_id,
            escrow.seller,
            escrow.amount,
            escrow.counter,
            block.timestamp
        );
    }

    // -------------------------------
    // I. Balance and Escrow Status Query Functions
    // -------------------------------
    /// @notice Returns information about a sequential escrow's target address and balance
    /// @param _escrowId The escrow identifier
    /// @return isSequential Whether the escrow is a sequential escrow
    /// @return sequentialAddress The address of the sequential escrow (or zero address if not sequential)
    /// @return sequentialBalance The USDC balance at the sequential address (or zero if not sequential)
    /// @dev This function specifically handles sequential escrow information retrieval and should be
    ///      used instead of trying to detect sequential escrows in other balance functions
    function getSequentialEscrowInfo(
        uint256 _escrowId
    )
        external
        view
        returns (
            bool isSequential,
            address sequentialAddress,
            uint256 sequentialBalance,
            bool wasReleased
        )
    {
        Escrow storage escrow = escrows[_escrowId];
        // Verify that the escrow exists by checking its ID field
        require(escrow.escrow_id == _escrowId, "Escrow does not exist");

        if (
            escrow.sequential && escrow.sequential_escrow_address != address(0)
        ) {
            return (
                true,
                escrow.sequential_escrow_address,
                usdc.balanceOf(escrow.sequential_escrow_address),
                escrow.state == EscrowState.Released
            );
        }

        return (false, address(0), 0, false);
    }

    /// @notice Returns the stored balance value of an escrow from the internal tracking
    /// @param _escrowId The escrow identifier
    /// @return The balance in USDC smallest unit (e.g. 6 decimals)
    function getStoredEscrowBalance(
        uint256 _escrowId
    ) external view returns (uint256) {
        Escrow storage escrow = escrows[_escrowId];
        // Verify that the escrow exists by checking its ID field
        require(escrow.escrow_id == _escrowId, "Escrow does not exist");

        // Return the balance we've tracked in our mapping
        // This is our source of truth for balance tracking within the contract
        // Note: For sequential escrows that have been released, this will return 0
        // Use getSequentialEscrowInfo() to get information about target sequential escrows
        return escrowBalances[_escrowId];
    }

    /// @notice Calculates the expected balance of an escrow based on its state.
    /// @notice Returns the calculated balance based on escrow state and type.
    ///         This is useful for displaying the logical balance based on the escrow's state.
    /// @param _escrowId The escrow identifier
    /// @return The expected balance in USDC smallest unit (e.g. 6 decimals)
    /// @dev This function implements escrow business logic regarding when a balance should
    ///      exist based on the escrow's state, which may differ from the stored balance
    function getCalculatedEscrowBalance(
        uint256 _escrowId
    ) external view returns (uint256) {
        Escrow storage escrow = escrows[_escrowId];
        // Verify that the escrow exists by checking its ID field
        require(escrow.escrow_id == _escrowId, "Escrow does not exist");

        // Check the state of the escrow to determine the expected balance
        if (
            escrow.state == EscrowState.Funded ||
            escrow.state == EscrowState.Disputed
        ) {
            // For funded or disputed escrows, the full amount should be available
            return escrow.amount;
        } else if (escrow.state == EscrowState.Created) {
            // For created but not yet funded escrows
            return 0;
        } else {
            // For other states (Released, Cancelled, Resolved),
            // the funds have been distributed or returned
            return 0;
        }
    }

    /// @notice Checks if an escrow is eligible for auto-cancellation based on its state and deadlines
    /// @param _escrowId The escrow identifier
    /// @return A boolean indicating whether the escrow can be auto-cancelled
    /// @dev This is useful for backend services monitoring for expired escrows that need cancellation
    function isEligibleForAutoCancel(
        uint256 _escrowId
    ) external view returns (bool) {
        Escrow storage escrow = escrows[_escrowId];

        // Verify that the escrow exists by checking its ID field
        if (escrow.escrow_id == 0) {
            return false;
        }

        // Check if escrow is in a non-terminal state
        if (
            escrow.state == EscrowState.Released ||
            escrow.state == EscrowState.Cancelled ||
            escrow.state == EscrowState.Resolved
        ) {
            return false;
        }

        // Check deadline conditions
        if (escrow.state == EscrowState.Created) {
            return block.timestamp > escrow.deposit_deadline;
        }
        if (escrow.state == EscrowState.Funded) {
            return !escrow.fiat_paid && block.timestamp > escrow.fiat_deadline;
        }

        // For other states (e.g., Disputed), not eligible for auto-cancellation
        return false;
    }
}
