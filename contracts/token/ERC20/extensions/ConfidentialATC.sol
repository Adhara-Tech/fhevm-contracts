// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import { IConfidentialATC } from "./IConfidentialATC.sol";
import { TFHEErrors } from "../../utils/TFHEErrors.sol";

/**
 * @title   ConfidentialATC.
 * @notice  This contract implements an encrypted ATC-like token with confidential balances using
 *          Zama's FHE (Fully Homomorphic Encryption) library.
 * @dev     It supports standard ATC functions such as transferring tokens, minting,
 *          and placing holds, but uses encrypted data types.
 *          The total supply is not encrypted.
 */
abstract contract ConfidentialATC is IConfidentialATC {

  address public owner;

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

  mapping(string => euint64) balances;
  mapping(string => Hold) holds;
  mapping(string => address) notaries;

  constructor(string memory tokenName, string memory tokenSymbol) {
    name = tokenName;
    symbol = tokenSymbol;
    owner = msg.sender;
  }

  function decimals() public view virtual returns (uint8) {
    return 6;
  }

  function name() public view virtual returns (string memory) {
    return "ATC";
  }

  function symbol() public view virtual returns (string memory) {
    return "USD";
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
    require(balances[fromAccount] >= amount, "Insufficient balance to place hold");
    balances[fromAccount] -= amount;
    Hold memory newHold = Hold(fromAccount, toAccount, notaryId, amount, uint256(0), metaData, IToken._HOLD_STATUS_PERPETUAL, IToken._HOLD_TYPE_NORMAL, "");
    holds[operationId] = newHold;
    //emit CreateHoldExecuted(operationId, fromAccount, toAccount, notaryId, amount, metaData);
    return true;
  }

  function executeHold(
    string calldata operationId
  ) external override returns (bool) {
    Hold memory holdToExecute = holds[operationId];
    require(keccak256(abi.encodePacked(holdToExecute.fromAccount)) != keccak256(abi.encodePacked("")), "Hold does not exist");
    balances[holdToExecute.toAccount] += holdToExecute.amount;
    delete holds[operationId];
    emit ExecuteHoldExecuted(operationId);
    return true;
  }

  function cancelHold(
    string calldata operationId
  ) external override returns (bool) {
    Hold memory holdToCancel = holds[operationId];
    require(keccak256(abi.encodePacked(holdToCancel.fromAccount)) != keccak256(abi.encodePacked("")), "Hold does not exist");
    balances[holdToCancel.fromAccount] += holdToCancel.amount;
    delete holds[operationId];
    emit CancelHoldExecuted(operationId);
    return true;
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

    if (keccak256(abi.encodePacked(holdToReturn.fromAccount)) == keccak256(abi.encodePacked(""))) {
      holdToReturn.holdStatus = IToken._HOLD_STATUS_NON_EXISTENT;
    }
    //require(holdToReturn._holdStatus != IToken._HOLD_STATUS_NON_EXISTENT, "Hold does not exist");
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

  function addHoldNotary(
    string calldata notaryId,
    address holdNotaryAdminAddress
  ) external override returns (bool) {
    notaries[notaryId] = holdNotaryAdminAddress;
    return true;
  }

  function isHoldNotary(string calldata notaryId)
  external override view returns (bool)
  {
    return notaries[notaryId] != address(0);
  }

  function makeHoldPerpetual(string calldata operationId)
  external override returns (bool)
  {
    Hold memory holdToChange = holds[operationId];
    holdToChange.holdStatus = IConfidentialATC._HOLD_STATUS_PERPETUAL;
    emit MakeHoldPerpetualExecuted(operationId);
    return true;
  }

  function create(
    string calldata operationId,
    string calldata toAccount,
    euint64 amount,
    string calldata metaData
  ) external override returns (bool) {
    require(msg.sender == owner, "Only the owner can create new tokens");
    balances[toAccount] += amount;
    return true;
  }

  function destroy(
    string calldata operationId,
    string calldata fromAccount,
    euint64 amount,
    string calldata metaData
  ) external override returns (bool) {
    require(msg.sender == owner, "Only the owner can destroy existing tokens");
    require(balances[fromAccount] >= amount, "Not enough tokens in existence to destroy");
    balances[fromAccount] -= amount;
    return true;
  }

  function transfer(
    string calldata operationId,
    string calldata fromAccount,
    string calldata toAccount,
    euint64 amount,
    string calldata metaData
  ) external override returns (bool) {
    require(msg.sender == owner, "Only the owner can transfer tokens");
    require(balances[fromAccount] >= amount, "Not enough tokens in existence to transfer");
    balances[fromAccount] -= amount;
    balances[toAccount] += amount;
    return true;
  }

  function getAvailableBalanceOf(string calldata account) external override view returns (uint256) {
    return balances[account];
  }
}

