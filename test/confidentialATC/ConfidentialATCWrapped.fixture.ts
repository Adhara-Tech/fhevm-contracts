import { Signer } from "ethers";
import { ethers } from "hardhat";

import type { ConfidentialATCWrapped, ATC, TestConfidentialATCWrapped } from "../../types";

export async function deployATCAndConfidentialATCWrappedFixture(
  account: Signer,
  name: string,
  symbol: string,
): Promise<[ATC, TestConfidentialATCWrapped]> {
  // @dev We use 5 minutes for the maximum decryption delay (from the Gateway).
  const maxDecryptionDelay = 60 * 5;
  const contractFactoryATC = await ethers.getContractFactory("TestATC");
  const contractATC = await contractFactoryATC
    .connect(account)
    .deploy(name, symbol, await account.getAddress());
  await contractATC.waitForDeployment();

  const contractFactory = await ethers.getContractFactory("TestConfidentialATCWrapped");
  const contractConfidentialATCWrapped = await contractFactory
    .connect(account)
    .deploy(contractATC.getAddress(), maxDecryptionDelay);
  await contractConfidentialATCWrapped.waitForDeployment();

  return [contractATC, contractConfidentialATCWrapped];
}

export async function mintAndWrap(
  account: Signer,
  accountId: string,
  plainToken: ATC,
  token: ConfidentialATCWrapped,
  tokenAddress: string,
  amount: bigint,
): Promise<void> {
  let tx = await plainToken.connect(account).create("operationId", accountId, amount, "");
  await tx.wait();

  tx = await token.connect(account).wrap("operationId", accountId, amount);
  await tx.wait();
}
