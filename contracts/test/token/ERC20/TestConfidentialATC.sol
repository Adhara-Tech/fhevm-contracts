// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { ConfidentialATC } from "../../../token/ERC20/extensions/ConfidentialATC.sol";
import { SepoliaZamaFHEVMConfig } from "fhevm/config/ZamaFHEVMConfig.sol";

contract TestConfidentialATC is SepoliaZamaFHEVMConfig, ConfidentialATC {
    constructor(
        string memory name_,
        string memory symbol_,
        address owner_
    ) ConfidentialATC(name_, symbol_, owner_) { }
}
