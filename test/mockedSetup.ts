import { ZeroAddress } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  ACL_ADDRESS,
  FHEPAYMENT_ADDRESS,
  GATEWAYCONTRACT_ADDRESS,
  INPUTVERIFIER_ADDRESS,
  KMSVERIFIER_ADDRESS, PRIVATE_KEY_COPROCESSOR_ACCOUNT,
  PRIVATE_KEY_KMS_SIGNER,
  TFHEEXECUTOR_ADDRESS,
} from "./constants";
import gatewayArtifact from "fhevm-core-contracts/artifacts/gateway/GatewayContract.sol/GatewayContract.json";
import {ethers} from "hardhat";

const OneAddress = "0x0000000000000000000000000000000000000001";

export async function setCodeMocked(hre: HardhatRuntimeEnvironment) {
  const aclArtifact = require("fhevm-core-contracts/artifacts/contracts/ACL.sol/ACL.json");
  const aclBytecode = aclArtifact.deployedBytecode;
  //console.log({ACL_ADDRESS})
  //console.log("%s", aclBytecode)
  await hre.network.provider.send("hardhat_setCode", [ACL_ADDRESS, aclBytecode]);
  const execArtifact = require("fhevm-core-contracts/artifacts/contracts/TFHEExecutorWithEvents.sol/TFHEExecutorWithEvents.json");
  const execBytecode = execArtifact.deployedBytecode;
  // console.log({TFHEEXECUTOR_ADDRESS})
  // console.log("%s", execBytecode)
  await hre.network.provider.send("hardhat_setCode", [TFHEEXECUTOR_ADDRESS, execBytecode]);
  const kmsArtifact = require("fhevm-core-contracts/artifacts/contracts/KMSVerifier.sol/KMSVerifier.json");
  const kmsBytecode = kmsArtifact.deployedBytecode;
  // console.log({KMSVERIFIER_ADDRESS})
  // console.log("%s", kmsBytecode)
  await hre.network.provider.send("hardhat_setCode", [KMSVERIFIER_ADDRESS, kmsBytecode]);
  const inputArtifact = require("fhevm-core-contracts/artifacts/contracts/InputVerifier.coprocessor.sol/InputVerifier.json");
  const inputBytecode = inputArtifact.deployedBytecode;
  // console.log({INPUTVERIFIER_ADDRESS})
  // console.log("%s", inputBytecode)
  await hre.network.provider.send("hardhat_setCode", [INPUTVERIFIER_ADDRESS, inputBytecode]);
  const fhepaymentArtifact = require("fhevm-core-contracts/artifacts/contracts/FHEPayment.sol/FHEPayment.json");
  const fhepaymentBytecode = fhepaymentArtifact.deployedBytecode;
  // console.log({FHEPAYMENT_ADDRESS})
  // console.log("%s", fhepaymentBytecode)
  await hre.network.provider.send("hardhat_setCode", [FHEPAYMENT_ADDRESS, fhepaymentBytecode]);
  const gatewayArtifact = require("fhevm-core-contracts/artifacts/gateway/GatewayContract.sol/GatewayContract.json");
  const gatewayBytecode = gatewayArtifact.deployedBytecode;
  // console.log({GATEWAYCONTRACT_ADDRESS})
  // console.log("%s", gatewayBytecode)
  await hre.network.provider.send("hardhat_setCode", [GATEWAYCONTRACT_ADDRESS, gatewayBytecode]);
  const zero = await impersonateAddress(hre, ZeroAddress, hre.ethers.parseEther("100"));
  const one = await impersonateAddress(hre, OneAddress, hre.ethers.parseEther("100"));
  const kmsSigner = new hre.ethers.Wallet(PRIVATE_KEY_KMS_SIGNER);
  const kms = await hre.ethers.getContractAt(kmsArtifact.abi, KMSVERIFIER_ADDRESS);
  await kms.connect(zero).initialize(OneAddress);
  await kms.connect(one).addSigner(kmsSigner);
  const input = await hre.ethers.getContractAt(inputArtifact.abi, INPUTVERIFIER_ADDRESS);
  await input.connect(zero).initialize(OneAddress);
  const gateway = await hre.ethers.getContractAt(gatewayArtifact.abi, GATEWAYCONTRACT_ADDRESS);
  await gateway.connect(zero).addRelayer(ZeroAddress);
}

export async function setCodeMocked2(hre: HardhatRuntimeEnvironment) {
  const aclArtifact = require("fhevm-core-contracts/artifacts/contracts/ACL.sol/ACL.json");
  const execArtifact = require("fhevm-core-contracts/artifacts/contracts/TFHEExecutorWithEvents.sol/TFHEExecutorWithEvents.json");
  const kmsArtifact = require("fhevm-core-contracts/artifacts/contracts/KMSVerifier.sol/KMSVerifier.json");
  const inputArtifact = require("fhevm-core-contracts/artifacts/contracts/InputVerifier.coprocessor.sol/InputVerifier.json");
  const fhepaymentArtifact = require("fhevm-core-contracts/artifacts/contracts/FHEPayment.sol/FHEPayment.json");
  const gatewayArtifact = require("fhevm-core-contracts/artifacts/gateway/GatewayContract.sol/GatewayContract.json");

  const zero = await hre.ethers.getSigner("fe3b557e8fb62b89f4916b721be55ceb828dbd73");
  const one = await hre.ethers.getSigner("627306090abaB3A6e1400e9345bC60c78a8BEf57");
  const kmsSigner = new hre.ethers.Wallet(PRIVATE_KEY_KMS_SIGNER);

  const kms = await hre.ethers.getContractAt(kmsArtifact.abi, KMSVERIFIER_ADDRESS);
  const init = await kms.connect(zero).initialize(one.address, { gasLimit: 6_000_000 })
  //console.log(await init.wait());
  const addSigner = await kms.connect(one).addSigner(kmsSigner, { gasLimit: 6_000_000 });
  //console.log(await addSigner.wait());
  const input = await hre.ethers.getContractAt(inputArtifact.abi, INPUTVERIFIER_ADDRESS);
  await input.connect(zero).initialize(one.address, { gasLimit: 6_000_000 });
  //console.log(await input.wait());
  const gateway = await hre.ethers.getContractAt(gatewayArtifact.abi, GATEWAYCONTRACT_ADDRESS);
  await gateway.connect(zero).addRelayer(zero.address, { gasLimit: 6_000_000 });
  //console.log(await gateway.wait());
}

export async function impersonateAddress(hre: HardhatRuntimeEnvironment, address: string, amount: bigint) {
  // for mocked mode
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });
  await hre.network.provider.send("hardhat_setBalance", [address, hre.ethers.toBeHex(amount)]);
  const impersonatedSigner = await hre.ethers.getSigner(address);
  return impersonatedSigner;
}
