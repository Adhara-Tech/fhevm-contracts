// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { ATC } from "../../../token/ERC20/extensions/ATC.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title     TestATC
 * @notice    This contract is an ATC token
 */
contract TestATC is ATC {
	constructor(
		string memory name_,
		string memory symbol_,
		address owner_
	) ATC(name_, symbol_, owner_) { }
}
