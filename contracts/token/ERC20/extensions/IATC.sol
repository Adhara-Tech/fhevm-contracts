pragma solidity ^0.8.24;

/**
 * @title   IATC.
 * @notice  Interface that defines ATC
 */
interface IATC {

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
	) external view returns (uint256);

	function registerAccount(string calldata account, address accountAddress) external;

	event RegisterAccountExecuted(string account, address accountAddress);

	/*
   * @notice Create tokens into the specified account.
   * @param operationId The id of the operation.
	 * @param toAccount The account id.
	 * @param amount The number of tokens.
	 * @param metaData Any public meta data / instructions accompanying the operation.
	 * @return A boolean indicating successful execution of the function.`
	 */
	function create(
		string calldata operationId,
		string calldata toAccount,
		uint256 amount,
		string calldata metaData
	) external;

	/* @notice Event emitted after tokens were created. */
	event CreateExecuted(
		string operationId,
		string toAccount,
		uint256 amount,
		string metaData
	);

	/*
	 * @notice Destroy tokens from the specified account.
	 * @param operationId The id of the operation.
	 * @param fromAccount The account id.
	 * @param amount The number of tokens.
	 * @param metaData Any public meta data / instructions accompanying the operation.
	 * @return A boolean indicating successful execution of the function.
	 */
	function destroy(
		string calldata operationId,
		string calldata fromAccount,
		uint256 amount,
		string calldata metaData
	) external;

	/* Event emitted after tokens were destroyed. */
	event DestroyExecuted(
		string operationId,
		string fromAccount,
		uint256 amount,
		string metaData
	);

	/*
	 * @notice Transfer tokens from one account to another.
	 * @param operationId The id of the operation.
	 * @param fromAccount The account id to transfer from.
	 * @param toAccount The account id to transfer to.
	 * @param amount The number of tokens.
	 * @param metaData Any public meta data / instructions accompanying the operation.
	 * @return Returns a boolean indicating successful execution of the function.
	 */
	function transfer(
		string calldata operationId,
		string calldata fromAccount,
		string calldata toAccount,
		uint256 amount,
		string calldata metaData
	) external returns (bool);

	/* Event emitted after tokens were destroyed. */
	event TransferExecuted(
		string operationId,
		string fromAccount,
		string toAccount,
		uint256 amount,
		string metaData
	);

	/*
	 * @notice Create a hold on some tokens, earmarked to be transferred from one account to another. Tokens on
	 * hold are not spendable until they are released or the hold is executed. The fromAccount can cancel (release)
	 * the hold after it has expired (i.e. after holdTimeout seconds), and the notary and toAccount can cancel (release) the hold
	 * at any time. It is possible to create a hold without specifying a notaryId using an empty string ("").
	 * @param operationId The id of the operation.
	 * @param fromAccount The account to hold from.
	 * @param toAccount The account to hold to.
	 * @param notaryId The notary id.
	 * @param amount The amount of tokens.
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
		uint256 amount,
		uint256 duration
	) external returns (bool);

	/* @notice Event emitted after a hold was successfully created. */
	event CreateHoldExecuted(
		string operationId,
		string fromAccount,
		string toAccount,
		string notaryId,
		uint256 amount
	);

	/*
	 * @notice Cancel an existing hold. The hold fromAccount can cancel the hold after it has expired (i.e. after duration seconds),
	 * and the notaryId and toAccount can cancel the hold at any time.
	 * @param operationId The id of the operation (hold).
	 * @return A boolean indicating successful execution of the function.
	 * @dev If successful, emits CancelHoldExecuted(string operationId) and HoldCancelledWithReason(string operationId, string reason).
	 */
	function cancelHold(
		string calldata operationId
	) external returns (bool);

	/* Event emitted after a hold was cancelled. */
	event CancelHoldExecuted(
		string operationId
	);

	/*
	 * @notice Execute an existing hold. The hold notaryId (if specified) and fromAccount can execute the hold.
	 * @param operationId The id of the operation (hold).
	 * @return A boolean indicating successful execution of the function.
	 * @dev If successful, emits ExecuteHoldExecuted(string operationId).
	 */
	function executeHold(
		string calldata operationId
	) external returns (bool);

	/* Event emitted after a hold was executed. */
	event ExecuteHoldExecuted(
		string operationId
	);

	/*
	 * @notice Make an existing hold perpetual.
	 * @param operationId The id of the operation (hold).
	 * @return A boolean indicating successful execution of the function.
	 * @dev If successful, emits MakeHoldPerpetualExecuted(string operationId).
	 */
	function makeHoldPerpetual(
		string calldata operationId
	) external returns (bool);

	/* @notice Event emitted after a hold was made perpetual. */
	event MakeHoldPerpetualExecuted(
		string operationId
	);

	/*
	 * Get the hold data.
	 * @param operationId The id of the operation (hold).
	 * @return fromAccount The sender account.
	 * @return toAccount The receiver account.
	 * @return notaryId The notary for the hold.
	 * @return amount The hold amount.
	 * @return expiryTimestamp The expiry timestamp.
	 * @return metaData The meta data.
	 * @return holdStatus Returns the hold data.
	 * @return holdType The hold type.
	 * @return signer The signer.
	 */
	function getHoldData(
		string calldata operationId
	) external view returns (
		string memory fromAccount,
		string memory toAccount,
		string memory notaryId,
		uint256 amount,
		uint256 expiryTimestamp,
		bytes32 holdStatus,
		bytes32 holdType
	);

	/*
	 * @notice Adds a hold notary for this contract. A Notary can cancel or execute any hold where this particular notaryId has been
	 * specified. It is recommended to only allow owners/administrators of the contract to perform this action.
	 * @param notaryId The id of the hold notary.
	 * @param holdNotaryAdminAddress The ethereum address that can administer this hold notary.
	 * @return A boolean indicating successful execution of the function.
	 */
	function addHoldNotary(
		string calldata notaryId,
		address holdNotaryAdminAddress
	) external returns (bool);

	/* @notice Event emitted after hold notary was added. */
	event AddHoldNotaryExecuted(
		string notaryId,
		address holdNotaryAdminAddress
	);

	/*
	 * @notice Returns whether a notary is available to be selected as a hold notary.
	 * @param notaryId The id of the notary.
	 * @return A boolean indicating whether this notary exists.
	 */
	function isHoldNotary(
		string calldata notaryId
	) external view returns (bool);
}
