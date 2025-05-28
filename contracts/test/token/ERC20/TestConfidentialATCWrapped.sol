// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { ConfidentialATCWrapped } from "../../../token/ERC20/extensions/ConfidentialATCWrapped.sol";
import { SepoliaZamaFHEVMConfig } from "fhevm/config/ZamaFHEVMConfig.sol";
import { SepoliaZamaGatewayConfig } from "fhevm/config/ZamaGatewayConfig.sol";

contract TestConfidentialATCWrapped is SepoliaZamaFHEVMConfig, SepoliaZamaGatewayConfig, ConfidentialATCWrapped {
    constructor(address atc_, uint256 maxDecryptionDelay_) ConfidentialATCWrapped(atc_, maxDecryptionDelay_) {}
}
