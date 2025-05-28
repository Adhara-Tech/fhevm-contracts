import { Signer } from "ethers";
import { FhevmInstance } from "fhevmjs/node";
import { ethers } from "hardhat";

import type { IConfidentialATC, TestConfidentialATC } from "../../types";
import { reencryptEuint64 } from "../reencrypt";

export async function deployConfidentialATCFixture(
  account: Signer,
  name: string,
  symbol: string,
  ownerAddress: string,
): Promise<TestConfidentialATC> {
  const contractFactory = await ethers.getContractFactory("TestConfidentialATC");
  const contract = await contractFactory.connect(account).deploy(name, symbol, ownerAddress);
  await contract.waitForDeployment();
  return contract;
}

export async function reEncryptBalance(
  account: Signer,
  accountId: string,
  instance: FhevmInstance,
  token: IConfidentialATC,
  tokenAddress: string,
): Promise<bigint> {
  const balanceHandle = await token.getAvailableBalanceOf(accountId);
  const balance = await reencryptEuint64(account, instance, balanceHandle, tokenAddress);
  return balance;
}
