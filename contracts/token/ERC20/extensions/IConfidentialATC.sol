pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";

/**
 * @title   IConfidentialERC20.
 * @notice  Interface that defines ERC20-like tokens with encrypted balances.
 */
interface IConfidentialATC {

	/* Hold status codes */
	bytes32 public constant _HOLD_STATUS_NON_EXISTENT = "nonExistent";
	bytes32 public constant _HOLD_STATUS_NEW = "new";
	bytes32 public constant _HOLD_STATUS_PERPETUAL = "perpetual";
	bytes32 public constant _HOLD_STATUS_CANCELLED = "cancelled";
	bytes32 public constant _HOLD_STATUS_EXECUTED = "executed";

	/* Hold types */
	bytes32 public constant _HOLD_TYPE_NORMAL = "normal";
	bytes32 public constant _HOLD_TYPE_DESTROY = "destroy";

	/**
 	 * @notice          Return the number of decimals.
   * @return decimals Number of decimals (e.g. 6).
	 */
	function decimals() external view returns (uint8 decimals);

	/**
	 * @notice          Return the name of the token.
	 * @return name     Name of the token (e.g. "TestToken").
	 */
	function name() external view returns (string memory name);

	/**
	 * @notice          Return the symbol of the token.
	 * @return symbol   Symbol of the token (e.g. "TEST").
	 */
	function symbol() external view returns (string memory symbol);

	/*
	 * Get the available balance of the specified account (net balance minus earmarked/held tokens).
	 * @param account The account id.
	 * @return Returns the available balance of the account.
	 */
	function getAvailableBalanceOf(
		string calldata account
	) external view virtual returns (euint64);

	/*
	 * Create a hold on some tokens, earmarked to be transferred from one account to another. Tokens on
	 * hold are not spendable until they are released or the hold is executed. The fromAccount can cancel (release)
	 * the hold after it has expired (i.e. after holdTimeout seconds), and the notary and toAccount can cancel (release) the hold
	 * at any time. It is possible to create a hold without specifying a notaryId using an empty string ("").
	 * @param operationId The id of the operation.
	 * @param fromAccount The account to hold from.
	 * @param toAccount The account to hold to.
	 * @param notaryId The notary id.
	 * @param amount The encrypted amount of tokens.
	 * @param duration The timeout period (seconds).
	 * @param metaData Any public meta data / instructions accompanying the operation.
	 * @return Returns true upon success.
	 * @dev If successful, emits CreateHoldExecuted(string operationId, string fromAccount, string toAccount, string notaryId, uint256 amount, string metaData)
	 */
	function createHold(
		string calldata operationId,
		string calldata fromAccount,
		string calldata toAccount,
		string calldata notaryId,
		euint64 amount,
		uint256 duration,
		string calldata metaData
	) external virtual returns (bool);

	/* Event emitted after a hold was successfully created. */
	event CreateHoldExecuted(
		string operationId,
		string fromAccount,
		string toAccount,
		string notaryId,
		euint64 amount,
		string metaData
	);

	/*
	 * Cancel an existing hold. The hold fromAccount can cancel the hold after it has expired (i.e. after duration seconds),
	 * and the notaryId and toAccount can cancel the hold at any time.
	 * @param operationId The id of the operation (hold).
	 * @return A boolean indicating successful execution of the function.
	 * @dev If successful, emits CancelHoldExecuted(string operationId) and HoldCancelledWithReason(string operationId, string reason).
	 */
	function cancelHold(
		string calldata operationId
	) external virtual returns (bool);

	/* Event emitted after a hold was cancelled. */
	event CancelHoldExecuted(
		string operationId
	);

	/*
	 * Execute an existing hold. The hold notaryId (if specified) and fromAccount can execute the hold.
	 * @param operationId The id of the operation (hold).
	 * @return A boolean indicating successful execution of the function.
	 * @dev If successful, emits ExecuteHoldExecuted(string operationId).
	 */
	function executeHold(
		string calldata operationId
	) external virtual returns (bool);

	/* Event emitted after a hold was executed. */
	event ExecuteHoldExecuted(
		string operationId
	);

	/*
	 * Make an existing hold perpetual.
	 * @param operationId The id of the operation (hold).
	 * @return A boolean indicating successful execution of the function.
	 * @dev If successful, emits MakeHoldPerpetualExecuted(string operationId).
	 */
	function makeHoldPerpetual(
		string calldata operationId
	) external virtual returns (bool);

	/* Event emitted after a hold was made perpetual. */
	event MakeHoldPerpetualExecuted(
		string operationId
	);

	/*
	 * Get the hold data.
	 * @param operationId The id of the operation (hold).
	 * @return fromAccount The sender account.
	 * @return toAccount The receiver account.
	 * @return notaryId The notary for the hold.
	 * @return amount The encrypted hold amounts.
	 * @return expiryTimestamp The expiry timestamp.
	 * @return metaData The meta data.
	 * @return holdStatus Returns the hold data.
	 * @return holdType The hold type.
	 * @return signer The signer.
	 */
	function getHoldData(
		string calldata operationId
	) external view virtual returns (
		string memory fromAccount,
		string memory toAccount,
		string memory notaryId,
		euint64 amount,
		uint256 expiryTimestamp,
		string memory metaData,
		bytes32 holdStatus,
		bytes32 holdType,
		bytes32 signer
	);

	/*
	 * Adds a hold notary for this contract. A Notary can cancel or execute any hold where this particular notaryId has been
	 * specified. It is recommended to only allow owners/administrators of the contract to perform this action.
	 * @param notaryId The id of the hold notary.
	 * @param holdNotaryAdminAddress The ethereum address that can administer this hold notary.
	 * @return A boolean indicating successful execution of the function.
	 * @dev If successful, emits AddHoldNotaryExecuted(string notaryId, address holdNotaryAdminAddress).
	 */
	function addHoldNotary(
		string calldata notaryId,
		address holdNotaryAdminAddress
	) external virtual returns (bool);

	/*
	 * Returns whether a notary is available to be selected as a hold notary.
	 * @param notaryId The id of the notary.
	 * @return A boolean indicating whether this notary exists.
	 */
	function isHoldNotary(
		string calldata notaryId
	) external view virtual returns (bool);

	/*
	 * Create tokens into the specified account.
	 * @param operationId The id of the operation.
	 * @param toAccount The account id.
	 * @param amount The number of tokens.
	 * @param metaData Any public meta data / instructions accompanying the operation.
	 * @return A boolean indicating successful execution of the function.`
	 * @dev If successful, emits CreateExecuted(string operationId, string toAccount, uint256 amount, string metaData)
	 * and BalanceUpdate(string operationId, string fromAccount, string toAccount, uint256 amount,
	 * bytes32 balanceUpdateType, uint256 timestamp, address signer, string metaData);
	 */
	function create(
		string calldata operationId,
		string calldata toAccount,
		euint64 amount,
		string calldata metaData
	) external virtual returns (bool);

	/*
	 * Destroy tokens from the specified account.
	 * @param operationId The id of the operation.
	 * @param fromAccount The account id.
	 * @param amount The encrypted number of tokens.
	 * @param metaData Any public meta data / instructions accompanying the operation.
	 * @return A boolean indicating successful execution of the function.
	 * @dev If successful, emits DestroyExecuted(string operationId, string fromAccount, uint256 amount, string metaData)
	 * and BalanceUpdate(string operationId, string fromAccount, string toAccount, uint256 amount,
	 * bytes32 balanceUpdateType, uint256 timestamp, address signer, string metaData);
	 */
	function destroy(
		string calldata operationId,
		string calldata fromAccount,
		euint64 amount,
		string calldata metaData
	) external virtual returns (bool);

	/*
	 * Transfer tokens from one account to another.
	 * @param operationId The id of the operation.
	 * @param fromAccount The account id to transfer from.
	 * @param toAccount The account id to transfer to.
	 * @param amount The encrypted number of tokens.
	 * @param metaData Any public meta data / instructions accompanying the operation.
	 * @return Returns a boolean indicating successful execution of the function.
	 * @dev If successful, emits TransferExecuted(string operationId, string fromAccount, string toAccount, uint256 amount, string metaData)
	 * and BalanceUpdate(string operationId, string fromAccount, string toAccount, uint256 amount,
	 * bytes32 balanceUpdateType, uint256 timestamp, address signer, string metaData);
	 */
	function transfer(
		string calldata operationId,
		string calldata fromAccount,
		string calldata toAccount,
		euint64 amount,
		string calldata metaData
	) external virtual returns (bool);
}
