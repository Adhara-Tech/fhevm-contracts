// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

/**
 * @title   IConfidentialATCWrapped.
 * @notice  Interface that defines events, errors, and structs for
 *          contracts that wrap native assets or AssetToken tokens.
 */
interface IConfidentialATCWrapped {
    /**
      * @notice Returned if the amount is greater than 2**64.
      */
    error AmountTooHigh();

    /**
      * @notice Returned if user cannot perform operation.
      */
    error RestrictedAccount();

    /**
     * @notice          Emitted when token is unwrapped.
     * @param accountId Account identifier of the account that unwraps tokens.
     * @param amount    Amount to unwrap.
     */
    event Unwrap(string indexed accountId, uint64 amount);

    /**
     * @notice          Emitted if unwrap fails due to lack of funds.
     * @param accountId Account identifier of the account that tried to unwrap.
     * @param amount    Amount to unwrap.
     */
    event UnwrapFailNotEnoughBalance(string accountId, uint64 amount);

    /**
     * @notice         Emitted if unwrap fails due to failed transfer.
     * @param accountId Account identifier of the account that tried to unwrap.
     * @param amount   Amount to unwrap.
     */
    event UnwrapFailTransferFail(string accountId, uint64 amount);

    /**
     * @notice         Emitted when token is wrapped.
     * @param accountId Account identifier of the account that wraps tokens.
     * @param amount   Amount to wrap.
     */
    event Wrap(string indexed accountId, uint64 amount);

    /**
     * @notice          Emitted if wrap fails due to failed transfer.
     * @param accountId Account identifier of the account that tried to wrap.
     * @param amount    Amount to wrap.
     */
    event WrapFailTransferFail(string accountId, uint64 amount);

    /**
     * @notice          This struct keeps track of the unwrap request information.
     * @param accountId Account identifier of the account that has initiated the unwrap request.
     * @param amount    Amount to be unwrapped.
     */
    struct UnwrapRequest {
        string accountId;
        uint64 amount;
    }
}
