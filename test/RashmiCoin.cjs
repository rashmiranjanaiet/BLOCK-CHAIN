const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RashmiCoin", function () {
  async function deployFixture() {
    const [owner, userA, userB] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory("RashmiCoin");
    const token = await tokenFactory.deploy(owner.address);
    await token.waitForDeployment();
    return { token, owner, userA, userB };
  }

  it("mints full initial capped supply to owner", async function () {
    const { token, owner } = await deployFixture();
    const maxSupply = await token.MAX_SUPPLY();
    expect(await token.totalSupply()).to.equal(maxSupply);
    expect(await token.balanceOf(owner.address)).to.equal(maxSupply);
  });

  it("transfers tokens between wallets", async function () {
    const { token, owner, userA } = await deployFixture();
    const amount = ethers.parseUnits("100", 18);
    await token.connect(owner).transfer(userA.address, amount);
    expect(await token.balanceOf(userA.address)).to.equal(amount);
  });

  it("burns holder tokens", async function () {
    const { token, owner } = await deployFixture();
    const amount = ethers.parseUnits("50", 18);
    const supplyBefore = await token.totalSupply();
    await token.connect(owner).burn(amount);
    expect(await token.totalSupply()).to.equal(supplyBefore - amount);
  });

  it("allows owner mint only up to cap", async function () {
    const { token, owner, userA } = await deployFixture();
    const burnAmount = ethers.parseUnits("1000", 18);
    await token.connect(owner).burn(burnAmount);

    await token.connect(owner).mint(userA.address, burnAmount);
    expect(await token.balanceOf(userA.address)).to.equal(burnAmount);

    await expect(token.connect(owner).mint(userA.address, 1n)).to.be.revertedWith("RSC: cap exceeded");
  });
});
