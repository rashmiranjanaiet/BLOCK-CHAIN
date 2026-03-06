require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const privateKey = process.env.PRIVATE_KEY || "";

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: privateKey ? [privateKey] : [],
    },
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL || "",
      accounts: privateKey ? [privateKey] : [],
      chainId: 97,
    },
    polygonAmoy: {
      url: process.env.POLYGON_AMOY_RPC_URL || "",
      accounts: privateKey ? [privateKey] : [],
      chainId: 80002,
    },
  },
};
