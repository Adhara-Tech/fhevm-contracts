// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import { IConfidentialATC } from "./IConfidentialATC.sol";
import { TFHEErrors } from "../../../utils/TFHEErrors.sol";

/**
 * @title   ConfidentialATC.
 * @notice  This contract implements an encrypted ATC-like token with confidential balances using
 *          Zama's FHE (Fully Homomorphic Encryption) library.
 * @dev     It supports standard ATC functions such as creating, destroying, transferring tokens,
 *          and placing holds, but uses encrypted data types.
 *          The total supply is not encrypted.
 */
abstract contract ConfidentialATC is IConfidentialATC {

  // @notice Used as a placeholder in `Transfer` events to comply with the official EIP20.
  uint256 internal constant _PLACEHOLDER = type(uint256).max;

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
    string toAccount;
    string notaryId;
    euint64 amount;
    uint256 expiryTimestamp;
    string metaData;
    bytes32 holdStatus;
    bytes32 holdType;
    bytes32 signer;
  }

  address public owner;
  string internal name;
  string internal symbol;
  uint8 internal decimals;
  uint64 internal totalSupply;

  mapping(string => euint64) balances;
  mapping(string => Hold) holds;
  mapping(string => address) notaries;

  constructor(string memory tokenName, string memory tokenSymbol) {
    name = tokenName;
    symbol = tokenSymbol;
    decimals = 6;
    owner = msg.sender;
  }

  function create(
    string calldata operationId,
    string calldata toAccount,
    euint64 amount,
    string calldata metaData
  ) external override returns (bool) {
    requireContractOwner();

    euint64 newBalanceAccount = TFHE.add(balances[toAccount], amount);
    balances[toAccount] = newBalanceAccount;

    emit CreateExecuted(operationId, toAccount, amount, metaData);
    return true;
  }

  function getAvailableBalanceOf(string calldata account) external override view returns (euint64) {
    return balances[account];
  }

  function destroy(
    string calldata operationId,
    string calldata fromAccount,
    euint64 amount,
    string calldata metaData
  ) external override returns (bool) {
    requireContractOwner();

    ebool canDestroy = TFHE.le(amount, balances[fromAccount]);
    euint64 destroyValue = TFHE.select(canDestroy, amount, TFHE.asEuint64(0));

    euint64 newFromBalance = TFHE.sub(balances[fromAccount], destroyValue);
    balances[fromAccount] = newFromBalance;

    emit DestroyExecuted(operationId, fromAccount, amount, metaData);
    return true;
  }

  function transfer(
    string calldata operationId,
    string calldata fromAccount,
    string calldata toAccount,
    euint64 amount,
    string calldata metaData,
    ebool isTransferable
  ) external override returns (bool) {
    requireContractOwner();

    ebool canTransfer = TFHE.and(isTransferable, TFHE.le(amount, balances[fromAccount]));
    euint64 transferValue = TFHE.select(canTransfer, amount, TFHE.asEuint64(0));

    euint64 newFromBalance = TFHE.sub(balances[fromAccount], transferValue);
    balances[fromAccount] = newFromBalance;

    euint64 newToBalance = TFHE.add(balances[toAccount], transferValue);
    balances[toAccount] = newToBalance;

    emit TransferExecuted(operationId, fromAccount, toAccount, amount, metaData);
    return true;
  }

  function createHold(
    string calldata operationId,
    string calldata fromAccount,
    string calldata toAccount,
    string calldata notaryId,
    euint64 amount,
    uint256 duration,
    string calldata metaData
  ) external override returns (bool) {
    requireNonExistingHold(holds[operationId]);

    ebool canHold = TFHE.le(amount, balances[fromAccount]);
    euint64 holdValue = TFHE.select(canHold, amount, TFHE.asEuint64(0));

    Hold memory newHold = Hold(fromAccount, toAccount, notaryId, holdValue, uint256(0), metaData, _HOLD_STATUS_PERPETUAL, _HOLD_TYPE_NORMAL, "");
    requireValidHold(newHold);

    euint64 newFromBalance = TFHE.sub(balances[fromAccount], holdValue);
    balances[fromAccount] = newFromBalance;

    holds[operationId] = newHold;

    emit CreateHoldExecuted(operationId, fromAccount, toAccount, notaryId, holdValue, metaData);
    return true;
  }

  function executeHold(
    string calldata operationId
  ) external override returns (bool) {
    Hold memory holdToExecute = holds[operationId];
    requireExistingHold(holdToExecute);
    requireExecutableHold(holdToExecute);

    euint64 newToBalance = TFHE.add(balances[holdToExecute.toAccount], holdToExecute.amount);
    balances[holdToExecute.toAccount] = newToBalance;

    delete holds[operationId];

    emit ExecuteHoldExecuted(operationId);
    return true;
  }

  function cancelHold(
    string calldata operationId
  ) external override returns (bool) {
    Hold memory holdToCancel = holds[operationId];
    requireExistingHold(holdToCancel);
    requireCancellableHold(holdToCancel);

    euint64 newFromBalance = TFHE.add(balances[holdToCancel.fromAccount], holdToCancel.amount);
    balances[holdToCancel.fromAccount] = newFromBalance;

    delete holds[operationId];

    emit CancelHoldExecuted(operationId);
    return true;
  }

  function addHoldNotary(
    string calldata notaryId,
    address holdNotaryAdminAddress
  ) external override returns (bool) {
    notaries[notaryId] = holdNotaryAdminAddress;
    return true;
  }

  function isHoldNotary(
    string calldata notaryId
  ) external override view returns (bool) {
    return notaries[notaryId] != address(0);
  }

  function getHoldData(string calldata operationId)
  external override view virtual
  returns (
    string memory fromAccount,
    string memory toAccount,
    string memory notaryId,
    euint64 amount,
    uint256 expiryTimestamp,
    string memory metaData,
    bytes32 holdStatus,
    bytes32 holdType,
    bytes32 signer
  ) {
    Hold memory holdToReturn = holds[operationId];
    requireExistingHold(holdToReturn);

    return (holdToReturn.fromAccount,
      holdToReturn.toAccount,
      holdToReturn.notaryId,
      holdToReturn.amount,
      holdToReturn.expiryTimestamp,
      holdToReturn.metaData,
      holdToReturn.holdStatus,
      holdToReturn.holdType,
      holdToReturn.signer);
  }

  function makeHoldPerpetual(
    string calldata operationId
  ) external override returns (bool) {
    Hold memory holdToChange = holds[operationId];
    requireExistingHold(holdToChange);
    holdToChange.holdStatus = _HOLD_STATUS_PERPETUAL;

    emit MakeHoldPerpetualExecuted(operationId);
    return true;
  }

  function requireContractOwner() internal view {
    require(msg.sender == owner, "Only the contract owner has permission to perform this operation");
  }

  function requireValidHold(
    Hold memory hold
  ) internal view {
    require(keccak256(abi.encodePacked(hold.fromAccount)) != keccak256(abi.encodePacked("")), "Invalid sending account in hold data");
    require(keccak256(abi.encodePacked(hold.toAccount)) != keccak256(abi.encodePacked("")), "Invalid receiving account in hold data");
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

