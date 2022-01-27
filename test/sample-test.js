const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFT", function () {
  [owner, minter, receiver] = await ethers.getSigners();

  beforeEach(async () => {
    const NFT = await ethers.getContractFactory("NFT");
    nft = await NFT.deploy();
    await nft.deployed();
  });

  describe("Deployment", async () => {});
  it("set the owner as contract deployer", async () => {
    const Greeter = await ethers.getContractFactory("Greeter");
    const greeter = await Greeter.deploy("Hello, world!");
    await greeter.deployed();

    expect(await greeter.greet()).to.equal("Hello, world!");

    const setGreetingTx = await greeter.setGreeting("Hola, mundo!");

    // wait until the transaction is mined
    await setGreetingTx.wait();

    expect(await greeter.greet()).to.equal("Hola, mundo!");
  });
});
