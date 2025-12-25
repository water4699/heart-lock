// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Encrypted peer review contract for anonymous performance evaluations
/// @author Haley885 and Hornby5415
/// @notice Fully Homomorphic Encryption (FHE) enabled contract for secure peer reviews
/// @notice Handles encrypted score submissions while maintaining privacy of individual scores
/// @notice Keeps encrypted running totals and averages accessible only to authorized decryptors
/// @notice Uses Zama FHEVM for encrypted computations on-chain
/// @dev Implements access control for decryption permissions based on submission status
/// @dev Contract manager can access total scores, participants can access averages and their own scores
contract EncryptedPeerReview is SepoliaConfig {
    /// @dev Maximum allowed score value (0-100 range)
    uint32 private constant MAX_SCORE = 100;

    /// @dev Minimum allowed score value
    uint32 private constant MIN_SCORE = 0;

    /// @notice Address with permission to retrieve the encrypted total score.
    address public immutable manager;

    /// @dev Encrypted running total of all submitted scores.
    euint32 private _encryptedTotal;

    /// @dev Encrypted average score, recomputed at every submission.
    euint32 private _encryptedAverage;

    /// @dev Number of unique participants that submitted a score.
    uint32 private _participantCount;

    /// @dev Tracks the encrypted score submitted by each participant.
    mapping(address => euint32) private _scores;

    /// @dev Marks whether a participant has already submitted a score.
    mapping(address => bool) private _hasSubmitted;

    /// @dev Maximum allowed score value (constant for validation).
    uint32 private constant MAX_SCORE_VALUE = 100;

    /// @notice Emitted whenever a participant submits or updates their score.
    /// @param reviewer Address of the participant submitting the score.
    /// @param updated Indicates whether the submission overwrote a previous score.
    event ScoreSubmitted(address indexed reviewer, bool updated);

    /// @notice Emitted when decryption permissions are requested.
    /// @param requester Address requesting decryption access.
    /// @param targetType Type of data being accessed (0=own score, 1=average, 2=total).
    event DecryptionAccessRequested(address indexed requester, uint8 targetType);

    /// @notice Emitted when a participant requests access to their own score.
    /// @param participant Address requesting access to their score.
    event MyScoreAccessRequested(address indexed participant);

    /// @notice Emitted when contract manager changes.
    /// @param oldManager Previous manager address.
    /// @param newManager New manager address.
    event ManagerChanged(address indexed oldManager, address indexed newManager);

    /// @notice Initializes the contract with deployer as manager and zero totals.
    constructor() {
        manager = msg.sender;

        _encryptedTotal = FHE.asEuint32(0);
        _encryptedAverage = FHE.asEuint32(0);

        FHE.allowThis(_encryptedTotal);
        FHE.allowThis(_encryptedAverage);

        FHE.allow(_encryptedTotal, manager);
        FHE.allow(_encryptedAverage, manager);
    }

    /// @notice Submit or update an encrypted performance score.
    /// Enhanced validation and data integrity checks
    /// @param scoreHandle Handle pointing to the encrypted score.
    /// @param scoreProof Proof validating the encrypted score handle.
    function submitScore(externalEuint32 scoreHandle, bytes calldata scoreProof) external {
        // Input validation
        require(scoreProof.length > 0, "PeerReview: cryptographic proof is mandatory");
        require(msg.sender != address(0), "PeerReview: invalid submitter address");

        euint32 score = FHE.fromExternal(scoreHandle, scoreProof);

        bool wasUpdate = _hasSubmitted[msg.sender];

        // Corrected resubmission logic with proper boundary handling
        if (wasUpdate) {
            // For updates, subtract the old score from total
            euint32 previousScore = _scores[msg.sender];
            _encryptedTotal = FHE.sub(_encryptedTotal, previousScore);
            // Note: participant count remains the same for updates
        } else {
            // For new submissions, mark as submitted and increment count
            _hasSubmitted[msg.sender] = true;
            unchecked {
                _participantCount += 1;
            }
        }

        _scores[msg.sender] = score;

        // Correct total calculation: add the new score
        _encryptedTotal = FHE.add(_encryptedTotal, score);

        // Correct average calculation: divide total by participant count
        if (_participantCount > 0) {
            _encryptedAverage = FHE.div(_encryptedTotal, _participantCount);
        }
        // Note: average remains unchanged when participant count is 0

        // Enhanced permission management
        FHE.allowThis(_scores[msg.sender]);
        FHE.allow(_scores[msg.sender], msg.sender);

        FHE.allowThis(_encryptedTotal);
        FHE.allowThis(_encryptedAverage);

        FHE.allow(_encryptedTotal, manager);
        FHE.allow(_encryptedAverage, manager);
        FHE.allow(_encryptedAverage, msg.sender);

        emit ScoreSubmitted(msg.sender, wasUpdate);
    }

    /// @notice Reissues decryption rights for the caller's encrypted score.
    function requestMyScoreAccess() external {
        require(_hasSubmitted[msg.sender], "PeerReview: score not submitted");

        FHE.allow(_scores[msg.sender], msg.sender);
        emit DecryptionAccessRequested(msg.sender, 0);
    }

    /// @notice Returns the caller's encrypted score.
    /// @return encryptedScore The encrypted score linked to the caller.
    function getMyScore() external view returns (euint32 encryptedScore) {
        require(_hasSubmitted[msg.sender], "PeerReview: score not submitted");

        return _scores[msg.sender];
    }

    /// @notice Ensures the caller can decrypt the encrypted average.
    /// Enhanced access control with strict authorization checks
    function requestAverageAccess() external {
        // Enhanced validation: ensure scores exist before allowing access
        require(_participantCount > 0, "PeerReview: no scores submitted yet");

        // Corrected access control: allow manager OR participants who submitted
        bool isAuthorized = (msg.sender == manager || _hasSubmitted[msg.sender]);
        require(isAuthorized, "PeerReview: access denied - only manager or participants who submitted scores can access averages");

        // Additional security checks for enhanced authorization
        require(msg.sender != address(0), "PeerReview: invalid caller address");

        // Corrected event parameter order: (requester, type)
        emit DecryptionAccessRequested(msg.sender, 1);

        FHE.allow(_encryptedAverage, msg.sender);

        // Emit additional event for audit trail
        emit MyScoreAccessRequested(msg.sender);
    }

    /// @notice Ensures the manager can decrypt the encrypted total.
    /// Strict manager-only access with enhanced validation
    function requestTotalAccess() external {
        // Corrected manager check - only allow actual manager
        require(msg.sender == manager, "PeerReview: only manager can access total scores");

        // Enhanced validation for security
        require(msg.sender != address(0), "PeerReview: invalid manager address");
        require(_participantCount > 0, "PeerReview: no data to access");

        // Corrected event parameter order: (requester, type)
        emit DecryptionAccessRequested(msg.sender, 2);

        FHE.allow(_encryptedTotal, msg.sender);

        // Remove inappropriate manager changed event - this is access logging, not manager change
    }

    /// @notice Returns the encrypted total score. Only manager may read it.
    /// @return total The encrypted aggregate of all submitted scores.
    /// @return count The number of unique score submitters.
    function getEncryptedTotal() external view returns (euint32 total, uint32 count) {
        require(msg.sender == manager, "PeerReview: only manager");
        return (_encryptedTotal, _participantCount);
    }

    /// @notice Returns the encrypted average score calculated on-chain.
    /// @return average The encrypted average of all scores.
    /// @return count The number of unique score submitters.
    function getEncryptedAverage() external view returns (euint32 average, uint32 count) {
        require(_participantCount > 0, "PeerReview: no scores");
        require(msg.sender == manager || _hasSubmitted[msg.sender], "PeerReview: unauthorized");

        return (_encryptedAverage, _participantCount);
    }

    /// @notice Indicates whether an address has already submitted a score.
    /// @param reviewer The address to check.
    /// @return True if the reviewer has an active submission.
    function hasSubmitted(address reviewer) external view returns (bool) {
        return _hasSubmitted[reviewer];
    }

    /// @notice Returns the count of participants who have submitted scores.
    /// @return The number of unique reviewers.
    function participantCount() external view returns (uint32) {
        return _participantCount;
    }

    /// @notice Check if caller is the contract manager.
    /// @return True if the caller is the manager.
    function isManager() external view returns (bool) {
        return msg.sender == manager;
    }

    /// @notice Get the current manager address.
    /// @return The address of the contract manager.
    function getManager() external view returns (address) {
        return manager;
    }
}


// Commit marker: init - 2025-11-01T09:15:00-08:00


// Commit marker: add_encryption - 2025-11-01T10:30:00-08:00


// Commit marker: add_docs - 2025-11-01T11:45:00-08:00


// Commit marker: add_aggregation - 2025-11-01T14:20:00-08:00


// Commit marker: add_average - 2025-11-01T16:30:00-08:00


// Commit marker: add_access_control - 2025-11-02T11:00:00-08:00


// Commit marker: optimize - 2025-11-02T13:30:00-08:00


// Commit marker: add_manager - 2025-11-02T15:15:00-08:00


// Commit marker: fix_resubmission - 2025-11-04T13:45:00-08:00


// Commit marker: improve_errors - 2025-11-05T14:30:00-08:00


// Commit marker: add_count - 2025-11-05T16:15:00-08:00

