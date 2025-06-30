// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { TFHEErrors } from "../../../utils/TFHEErrors.sol";
import { IConfidentialATC } from "./IConfidentialATC.sol";


/**
 * @title   ConfidentialATC.
 * @notice  This contract implements an encrypted ATC-like token with confidential balances using
 *          Zama's FHE (Fully Homomorphic Encryption) library.
 * @dev     It supports standard ATC functions such as creating, destroying, transferring tokens,
 *          and placing holds, but uses encrypted data types.
 *          The total supply is not encrypted.
 */
abstract contract ConfidentialATC is IConfidentialATC, TFHEErrors, Ownable2Step {

  /* Hold status codes */
  bytes32 internal constant _HOLD_STATUS_NON_EXISTENT = "";
  bytes32 internal constant _HOLD_STATUS_NEW = "new";
  bytes32 internal constant _HOLD_STATUS_PERPETUAL = "perpetual";
  bytes32 internal constant _HOLD_STATUS_CANCELLED = "cancelled";
  bytes32 internal constant _HOLD_STATUS_EXECUTED = "executed";

  /* Hold types */
  bytes32 internal constant _HOLD_TYPE_NORMAL = "normal";
  bytes32 internal constant _HOLD_TYPE_DESTROY = "destroy";

  struct Hold {
    string fromAccount;
    address fromAddress;
    string toAccount;
    address toAddress;
    string notaryId;
    euint64 amount;
    uint256 expiryTimestamp;
    bytes32 holdStatus;
    bytes32 holdType;
  }

  struct Operation {
    string operationId;
    string fromAccount;
    address fromAddress;
    string toAccount;
    address toAddress;
    euint64 amount;
  }

  string internal _name;
  string internal _symbol;
  uint8 internal _decimals;
  uint64 internal _totalSupply;

  mapping(string => euint64) _balances;
  mapping(string => Hold) _holds;
  mapping(string => address) _notaries;

  constructor(string memory tokenName, string memory tokenSymbol, address tokenOwner) Ownable(tokenOwner) {
    _name = tokenName;
    _symbol = tokenSymbol;
    _decimals = 6;
  }

  function decimals() public view virtual returns (uint8) {
    return _decimals;
  }

  function name() public view virtual returns (string memory) {
    return _name;
  }

  function symbol() public view virtual returns (string memory) {
    return _symbol;
  }

  function totalSupply() public view virtual returns (uint64) {
    return _totalSupply;
  }

  function registerAccount(string calldata account, address accountAddress)
  public virtual onlyOwner {
    euint64 initialBalance = TFHE.asEuint64(0);
    _balances[account] = initialBalance;
    TFHE.allowThis(initialBalance);
    TFHE.allow(initialBalance, accountAddress);

    emit RegisterAccountExecuted(account, accountAddress);
  }

  function create(
    string calldata operationId,
    string calldata toAccount,
    address toAddress,
    uint64 amount,
    string calldata metaData
  ) public virtual onlyOwner {
    euint64 newToBalance = TFHE.add(_balances[toAccount], amount);
    _balances[toAccount] = newToBalance;
    TFHE.allowThis(newToBalance);
    TFHE.allow(newToBalance, toAddress);

    emit CreateExecuted(operationId, toAccount, toAddress, amount, metaData);
  }

  function getAvailableBalanceOf(string calldata account)
  external override view returns (euint64) {
    return _balances[account];
  }

  function destroy(
    string calldata operationId,
    string calldata fromAccount,
    address fromAddress,
    euint64 amount,
    string calldata metaData
  ) internal onlyOwner {

    ebool canDestroy = TFHE.le(amount, _balances[fromAccount]);
    euint64 destroyValue = TFHE.select(canDestroy, amount, TFHE.asEuint64(0));

    euint64 newFromBalance = TFHE.sub(_balances[fromAccount], destroyValue);
    _balances[fromAccount] = newFromBalance;
    TFHE.allowThis(newFromBalance);
    TFHE.allow(newFromBalance, fromAddress);

    emit DestroyExecuted(operationId, fromAccount, fromAddress, amount, metaData);
  }

  function destroy(
    string calldata operationId,
    string calldata fromAccount,
    address fromAddress,
    einput encryptedAmount,
    bytes calldata inputProof,
    string calldata metaData
  ) external override {
    destroy(operationId, fromAccount, fromAddress, TFHE.asEuint64(encryptedAmount, inputProof), metaData);
  }

  function transfer(
    Operation memory operation
  ) internal returns (bool) {

    ebool canTransfer = TFHE.le(operation.amount, _balances[operation.fromAccount]);
    euint64 transferValue = TFHE.select(canTransfer, operation.amount, TFHE.asEuint64(0));

    TFHE.allowThis(transferValue);
    TFHE.allow(transferValue, operation.fromAddress);
    TFHE.allow(transferValue, operation.toAddress);

    euint64 newFromBalance = TFHE.sub(_balances[operation.fromAccount], transferValue);
    _balances[operation.fromAccount] = newFromBalance;
    TFHE.allowThis(newFromBalance);
    TFHE.allow(newFromBalance, operation.fromAddress);

    euint64 newToBalance = TFHE.add(_balances[operation.toAccount], transferValue);
    _balances[operation.toAccount] = newToBalance;
    TFHE.allowThis(newToBalance);
    TFHE.allow(newToBalance, operation.toAddress);

    emit TransferExecuted(operation.operationId, operation.fromAccount, operation.fromAddress, operation.toAccount, operation.toAddress, transferValue);
    return true;
  }

  function transfer(
    string memory operationId,
    string memory fromAccount,
    address fromAddress,
    string memory toAccount,
    address toAddress,
    einput encryptedAmount,
    bytes memory inputProof
  ) public virtual returns (bool) {
    Operation memory operation = Operation(
      operationId,
      fromAccount,
      fromAddress,
      toAccount,
      toAddress,
      TFHE.asEuint64(encryptedAmount, inputProof)
    );
    return transfer(operation);
  }

  function createHold(
    Operation memory operation,
    string memory notaryId,
    uint256 expiryTimestamp,
    bytes32 holdStatus,
    bytes32 holdType
  ) internal returns (bool) {
    requireNonExistingHold(_holds[operation.operationId]);

    ebool canHold = TFHE.le(operation.amount, _balances[operation.fromAccount]);
    euint64 holdValue = TFHE.select(canHold, operation.amount, TFHE.asEuint64(0));

    Hold memory newHold = Hold(operation.fromAccount, operation.fromAddress, operation.toAccount, operation.toAddress, notaryId, holdValue, expiryTimestamp, holdStatus, holdType);
    requireValidHold(newHold);
    TFHE.allowThis(holdValue);
    TFHE.allow(holdValue, operation.fromAddress);
    TFHE.allow(holdValue, operation.toAddress);

    euint64 newFromBalance = TFHE.sub(_balances[operation.fromAccount], holdValue);
    _balances[operation.fromAccount] = newFromBalance;
    TFHE.allowThis(newFromBalance);
    TFHE.allow(newFromBalance, operation.fromAddress);

    _holds[operation.operationId] = newHold;

    emit CreateHoldExecuted(operation.operationId, operation.fromAccount, operation.fromAddress, operation.toAccount, operation.toAddress, notaryId, holdValue);
    return true;
  }

  function createHold(
    string memory operationId,
    string memory fromAccount,
    address fromAddress,
    string memory toAccount,
    address toAddress,
    string memory notaryId,
    einput encryptedAmount,
    bytes memory inputProof,
    uint256 expiryTimestamp
  ) public virtual returns (bool) {
    Operation memory operation = Operation(
      operationId,
      fromAccount,
      fromAddress,
      toAccount,
      toAddress,
      TFHE.asEuint64(encryptedAmount, inputProof)
    );
    return createHold(operation, notaryId, expiryTimestamp, _HOLD_STATUS_PERPETUAL, _HOLD_TYPE_NORMAL);
  }

  function executeHold(
    string calldata operationId
  ) public virtual returns (bool) {
    Hold memory holdToExecute = _holds[operationId];
    requireExistingHold(holdToExecute);
    requireExecutableHold(holdToExecute);

    euint64 newToBalance = TFHE.add(_balances[holdToExecute.toAccount], holdToExecute.amount);
    _balances[holdToExecute.toAccount] = newToBalance;
    TFHE.allowThis(newToBalance);
    TFHE.allow(newToBalance, holdToExecute.toAddress);

    delete _holds[operationId];

    emit ExecuteHoldExecuted(operationId);
    return true;
  }

  function cancelHold(
    string calldata operationId
  ) public virtual returns (bool) {
    Hold memory holdToCancel = _holds[operationId];
    requireExistingHold(holdToCancel);
    requireCancellableHold(holdToCancel);

    euint64 newFromBalance = TFHE.add(_balances[holdToCancel.fromAccount], holdToCancel.amount);
    _balances[holdToCancel.fromAccount] = newFromBalance;
    TFHE.allowThis(newFromBalance);
    TFHE.allow(newFromBalance, holdToCancel.fromAddress);

    delete _holds[operationId];

    emit CancelHoldExecuted(operationId);
    return true;
  }

  function addHoldNotary(
    string calldata notaryId,
    address holdNotaryAdminAddress
  ) public virtual returns (bool) {
    _notaries[notaryId] = holdNotaryAdminAddress;
    return true;
  }

  function isHoldNotary(
    string calldata notaryId
  ) public virtual view returns (bool) {
    return _notaries[notaryId] != address(0);
  }

  function getHoldData(string calldata operationId)
  public virtual view returns (
    string memory fromAccount,
    address fromAddress,
    string memory toAccount,
    address toAddress,
    string memory notaryId,
    euint64 amount,
    uint256 expiryTimestamp,
    bytes32 holdStatus,
    bytes32 holdType
  ) {
    Hold memory holdToReturn = _holds[operationId];
    requireExistingHold(holdToReturn);

    return (holdToReturn.fromAccount, holdToReturn.fromAddress,
      holdToReturn.toAccount, holdToReturn.toAddress,
      holdToReturn.notaryId,
      holdToReturn.amount,
      holdToReturn.expiryTimestamp,
      holdToReturn.holdStatus,
      holdToReturn.holdType);
  }

  function makeHoldPerpetual(
    string calldata operationId
  ) public virtual returns (bool) {
    Hold memory holdToChange = _holds[operationId];
    requireExistingHold(holdToChange);
    holdToChange.holdStatus = _HOLD_STATUS_PERPETUAL;

    emit MakeHoldPerpetualExecuted(operationId);
    return true;
  }

  function requireValidHold(
    Hold memory hold
  ) internal view {
    require(keccak256(abi.encodePacked(hold.fromAccount)) != keccak256(abi.encodePacked("")), "Invalid sending account in hold data");
    require(hold.fromAddress != address(0), "Invalid sending account address in hold data");
    require(keccak256(abi.encodePacked(hold.toAccount)) != keccak256(abi.encodePacked("")), "Invalid receiving account in hold data");
    require(hold.toAddress != address(0), "Invalid receiving account address in hold data");
  }

  function requireExistingHold(
    Hold memory hold
  ) internal view {
    require(hold.holdStatus != _HOLD_STATUS_NON_EXISTENT, "Hold does not exist");
  }

  function requireNonExistingHold(
    Hold memory hold
  ) internal view {
    require(hold.holdStatus == _HOLD_STATUS_NON_EXISTENT, "Hold already exists");
  }

  function requireExecutableHold(
    Hold memory hold
  ) internal view {
    require(hold.holdStatus == _HOLD_STATUS_PERPETUAL, "Hold is not executable");
  }

  function requireCancellableHold(
    Hold memory hold
  ) internal view {
    require(hold.holdStatus == _HOLD_STATUS_NEW
         || hold.holdStatus == _HOLD_STATUS_PERPETUAL, "Hold is not cancellable");
  }
}

