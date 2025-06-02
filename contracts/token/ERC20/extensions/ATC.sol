// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { TFHEErrors } from "../../../utils/TFHEErrors.sol";
import { IATC } from "./IATC.sol";

/**
 * @title   ATC.
 * @notice  This contract implements an ATC-like token.
 * @dev     It supports standard ATC functions such as creating, destroying, transferring tokens,
 *          and placing holds
 */
abstract contract ATC is IATC, Ownable2Step {


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
    uint256 amount;
    uint256 expiryTimestamp;
    bytes32 holdStatus;
    bytes32 holdType;
  }

  string internal _name;
  string internal _symbol;
  uint8 internal _decimals;
  uint64 internal _totalSupply;

  mapping(string => uint256) _balances;
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
    _balances[account] = 0;
    emit RegisterAccountExecuted(account, accountAddress);
  }

  function create(
    string calldata operationId,
    string calldata toAccount,
    uint256 amount,
    string calldata metaData
  ) public virtual onlyOwner {
    _balances[toAccount] += amount;
    emit CreateExecuted(operationId, toAccount, amount, metaData);
  }

  function getAvailableBalanceOf(string calldata account)
  external override view returns (uint256) {
    return _balances[account];
  }

  function destroy(
    string calldata operationId,
    string calldata fromAccount,
    uint256 amount,
    string calldata metaData
  ) public override {
    require(_balances[fromAccount] >= amount, "Insufficient balance");
    _balances[fromAccount] -= amount;
    emit DestroyExecuted(operationId, fromAccount, amount, metaData);
  }

  function transfer(
    string calldata operationId,
    string calldata fromAccount,
    string calldata toAccount,
    uint256 amount,
    string calldata metaData
  ) public override returns (bool) {
    require(_balances[fromAccount] >= amount, "Insufficient balance");
    _balances[fromAccount] -= amount;
    _balances[toAccount] += amount;
    emit TransferExecuted(operationId, fromAccount, toAccount, amount, metaData);
    return true;
  }

  function createHold(
    string calldata operationId,
    string calldata fromAccount,
    string calldata toAccount,
    string calldata notaryId,
    uint256 amount,
    uint256 duration
  ) public override returns (bool) {
    requireNonExistingHold(_holds[operationId]);
    require(_balances[fromAccount] >= amount, "Insufficient balance");
    _balances[fromAccount] -= amount;
    Hold memory newHold = Hold(fromAccount, toAccount, notaryId, amount, uint256(0), _HOLD_STATUS_PERPETUAL, _HOLD_TYPE_NORMAL);
    _holds[operationId] = newHold;
    emit CreateHoldExecuted(operationId, fromAccount,  toAccount,  notaryId, amount);
    return true;
  }


  function executeHold(
    string calldata operationId
  ) external override returns (bool) {
    Hold memory holdToExecute = _holds[operationId];
    requireExistingHold(holdToExecute);
    requireExecutableHold(holdToExecute);
    _balances[holdToExecute.toAccount] += holdToExecute.amount;
    delete _holds[operationId];
    emit ExecuteHoldExecuted(operationId);
    return true;
  }

  function cancelHold(
    string calldata operationId
  ) external override returns (bool) {
    Hold memory holdToCancel = _holds[operationId];
    requireExistingHold(holdToCancel);
    requireCancellableHold(holdToCancel);
    _balances[holdToCancel.fromAccount] += holdToCancel.amount;
    delete _holds[operationId];

    emit CancelHoldExecuted(operationId);
    return true;
  }

  function addHoldNotary(
    string calldata notaryId,
    address holdNotaryAdminAddress
  ) external override returns (bool) {
    _notaries[notaryId] = holdNotaryAdminAddress;
    return true;
  }

  function isHoldNotary(
    string calldata notaryId
  ) external override view returns (bool) {
    return _notaries[notaryId] != address(0);
  }

  function getHoldData(string calldata operationId)
  external override view virtual
  returns (
    string memory fromAccount,
    string memory toAccount,
    string memory notaryId,
    uint256 amount,
    uint256 expiryTimestamp,
    bytes32 holdStatus,
    bytes32 holdType
  ) {
    Hold memory holdToReturn = _holds[operationId];
    requireExistingHold(holdToReturn);

    return (holdToReturn.fromAccount,
      holdToReturn.toAccount,
      holdToReturn.notaryId,
      holdToReturn.amount,
      holdToReturn.expiryTimestamp,
      holdToReturn.holdStatus,
      holdToReturn.holdType);
  }

  function makeHoldPerpetual(
    string calldata operationId
  ) external override returns (bool) {
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

