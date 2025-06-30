import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import dotenv from "dotenv";
import "hardhat-ignore-warnings";
import { HardhatUserConfig, extendProvider } from "hardhat/config";
import { task } from "hardhat/config";
import type { NetworkUserConfig } from "hardhat/types";
import { resolve } from "path";
import "solidity-docgen";

import CustomProvider from "./CustomProvider";
import { setCodeMocked, setCodeMockedForBesu } from "./test/mockedSetup";

extendProvider(async (provider) => {
  const newProvider = new CustomProvider(provider);
  return newProvider;
});

task("compile:specific", "Compiles only the specified contract")
  .addParam("contract", "The contract's path")
  .setAction(async ({ contract }, hre) => {
    // Adjust the configuration to include only the specified contract
    hre.config.paths.sources = contract;

    await hre.run("compile");
  });

const dotenvConfigPath: string = process.env.DOTENV_CONFIG_PATH || "./.env";
dotenv.config({ path: resolve(__dirname, dotenvConfigPath) });

// Ensure that we have all the environment variables we need.
const mnemonic: string = process.env.MNEMONIC || "test test test test test test test test test test test junk";

const chainIds = {
  zama: 8009,
  local: 44845,
  localCoprocessor: 12345,
  sepolia: 11155111,
};

function getChainConfig(chain: keyof typeof chainIds): NetworkUserConfig {
  let jsonRpcUrl: string;
  let accounts = {}
  switch (chain) {
    case "local":
      jsonRpcUrl = "http://127.0.0.1:8545";
      break;
    case "localCoprocessor":
      jsonRpcUrl = "http://127.0.0.1:8745";
      break;
    case "zama":
      jsonRpcUrl = "https://devnet.zama.ai";
      break;
    case "sepolia":
      jsonRpcUrl = process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR-PROJECT-ID";
  }
  return {
    accounts: {
      count: 10,
      mnemonic,
      path: "m/44'/60'/0'/0",
    },
    chainId: chainIds[chain],
    url: jsonRpcUrl,
  };
}

task("coverage").setAction(async (taskArgs, hre, runSuper) => {
  hre.config.networks.hardhat.allowUnlimitedContractSize = true;
  hre.config.networks.hardhat.blockGasLimit = 1099511627775;

  await runSuper(taskArgs);
});

task("test", "Setup test environment")
  .addFlag("mocked", "Already mocked")
  .setAction(async (_taskArgs, hre, runSuper) => {
  // Run modified test task
  if (hre.network.name === "hardhat") {
    console.log("Setting up for hardhat testing")
    await setCodeMocked(hre);
  }
  if (hre.network.name === "besu") {
    if (!_taskArgs.mocked) {
      console.log("Setting up for besu testing")
      await setCodeMockedForBesu(hre);
    } else { // npx hardhat test --mocked
      console.log("Skipping setup besu network")
    }
  }
  await runSuper();
});

const config: HardhatUserConfig = {
  docgen: {
    output: "docs",
    pages: "files",
    exclude: ["test/"],
  },
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: 0,
  },
  mocha: {
    timeout: 500000,
  },
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
    src: "./contracts",
  },
  networks: {
    hardhat: {
      accounts: {
        count: 10,
        mnemonic,
        path: "m/44'/60'/0'/0",
      },
    },
    // sepolia: getChainConfig("sepolia"),
    // zama: getChainConfig("zama"),
    // localDev: getChainConfig("local"),
    // local: getChainConfig("local"),
    // localCoprocessor: getChainConfig("localCoprocessor"),
    besu: {
      url: "http://localhost:8545",
      accounts: [
        "0x8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63",
        "0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3",
        "0xae6ae8e5ccbfb04590405997ee2d52d2b330726137b875053c36d94e974d162f",
      ],
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.8.24",
    settings: {
      metadata: {
        // Not including the metadata hash
        // https://github.com/paulrberg/hardhat-template/issues/31
        bytecodeHash: "none",
      },
      // Disable the optimizer when debugging
      // https://hardhat.org/hardhat-network/#solidity-optimizer-support
      optimizer: {
        enabled: true,
        runs: 1000,
        details: {
          yul: true,
        },
      },
      evmVersion: "cancun",
      viaIR: false
    },
  },
  warnings: {
    "*": {
      "transient-storage": false,
    },
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
};

export default config;
