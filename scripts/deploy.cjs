const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying RashmiCoin from: ${deployer.address}`);

  const tokenFactory = await ethers.getContractFactory("RashmiCoin");
  const token = await tokenFactory.deploy(deployer.address);
  await token.waitForDeployment();

  const tokenAddress = await token.getAddress();
  console.log(`RashmiCoin deployed at: ${tokenAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
