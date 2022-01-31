const { BN, constants, expectRevert } = require('@openzeppelin/test-helpers')
const { ZERO_ADDRESS } = constants
const { expect } = require('chai')
const { ethers } = require('hardhat')

describe('NFT', () => {
  let marketplace
  let nft
  let marketplaceFee = ethers.BigNumber.from(250)
  let royaltyAmount = ethers.BigNumber.from(500)
  let newRoyaltyAmount = ethers.BigNumber.from(750)
  let salePrice = ethers.BigNumber.from(ethers.utils.parseEther('10'))
  const token1URI = 'https://ipfs.io/ipfs/QmXmNSH2dyp5R6dkW5MVhNc7xqV9v3NHWxNXJfCL6CcYxS'
  const token2URI = 'https://ipfs.io/ipfs/QmQ35DkX8HHjhkJe5MsMAd4X51iP3MHV5d5dZoee32J83k'

  beforeEach(async () => {
    ;[contractOwner, minter, receiver, operator, whitelistAdd1, whitelistAdd2] =
      await ethers.getSigners()
    const Marketplace = await hre.ethers.getContractFactory('Marketplace')
    marketplace = await Marketplace.deploy(marketplaceFee)
    await marketplace.deployed()

    const NFT = await ethers.getContractFactory('NFT')
    nft = await NFT.deploy(marketplace.address)
    await nft.deployed()
  })

  describe('Deployment', async () => {
    it('has a name', async () => {
      expect(await nft.name()).to.equal('Arkiv')
    })

    it('has a symbol', async () => {
      expect(await nft.symbol()).to.equal('ARKV')
    })

    it('sets the owner as contract deployer', async () => {
      expect(await nft.owner()).to.equal(contractOwner.address)
    })
  })

  describe('Minting', async () => {
    let tokenId

    beforeEach(async () => {
      await nft.addToWhitelist(minter.address)
      const token = await nft
        .connect(minter)
        .mint(minter.address, token1URI, minter.address, royaltyAmount)
      const txn = await token.wait()
      tokenId = txn.events[0].args.tokenId
    })

    it('mints tokens to msg sender', async () => {
      expect(await nft.balanceOf(minter.address)).to.equal(1)
    })

    it('sets owner of token as minter', async () => {
      expect(await nft.ownerOf(tokenId)).to.equal(minter.address)
    })

    it('sets creator of token as creator', async () => {
      expect(await nft.tokenCreator(tokenId)).to.equal(minter.address)
    })

    it('sets tokenURI upon minting', async () => {
      expect(await nft.tokenURI(tokenId)).to.equal(token1URI)
    })

    it('reverts on mint to null address', async () => {
      await nft.addToWhitelist(contractOwner.address)
      await expectRevert(
        nft.mint(ZERO_ADDRESS, token1URI, ZERO_ADDRESS, royaltyAmount),
        'ERC721: mint to the zero address'
      )
    })
  })

  describe('Transfers', async () => {
    let tokenId
    beforeEach(async () => {
      await nft.addToWhitelist(contractOwner.address)
      const token = await nft.mint(minter.address, token1URI, minter.address, royaltyAmount)
      const txn = await token.wait()
      tokenId = txn.events[0].args.tokenId
    })

    it('allows owner to transfer tokens using transferFrom', async () => {
      await nft.connect(minter).transferToken(minter.address, receiver.address, tokenId)
      expect(await nft.balanceOf(minter.address)).to.equal(0)
      expect(await nft.balanceOf(receiver.address)).to.equal(1)
    })

    it('allows approved operator to transfer tokens using transferFrom', async () => {
      await nft.connect(minter).approve(operator.address, tokenId)
      await nft.connect(operator).transferToken(minter.address, receiver.address, tokenId)
      expect(await nft.balanceOf(minter.address)).to.equal(0)
      expect(await nft.balanceOf(receiver.address)).to.equal(1)
    })

    it('reverts if caller is not owner or approved operator ', async () => {
      await expectRevert(
        nft.transferToken(minter.address, receiver.address, tokenId),
        'ERC721: transfer caller is not owner nor approved'
      )
    })
  })

  describe('Burning', async () => {
    let tokenId
    beforeEach(async () => {
      await nft.addToWhitelist(contractOwner.address)
      const token = await nft.mint(minter.address, token1URI, minter.address, royaltyAmount)
      const txn = await token.wait()
      tokenId = txn.events[0].args.tokenId
    })

    it('only allows token owner to burn tokens', async () => {
      await nft.connect(minter).burn(tokenId)
      expect(await nft.balanceOf(minter.address)).to.equal(0)
    })

    it('reverts if caller is not token owner', async () => {
      await expectRevert(nft.burn(tokenId), 'Caller is not the owner')
    })
  })

  describe('Updating token URI', async () => {
    let tokenId
    beforeEach(async () => {
      await nft.addToWhitelist(minter.address)
      const token = await nft
        .connect(minter)
        .mint(minter.address, token1URI, minter.address, royaltyAmount)
      const txn = await token.wait()
      tokenId = txn.events[0].args.tokenId
    })

    it('allows creator to update URI if they are also the owner', async () => {
      await nft.connect(minter).updateTokenMetadata(tokenId, token2URI)
      expect(await nft.tokenURI(tokenId)).to.equal(token2URI)
    })

    it('emits a TokenURIUpdated event', async () => {
      await expect(nft.connect(minter).updateTokenMetadata(tokenId, token2URI))
        .to.emit(nft, 'TokenURIUpdated')
        .withArgs(tokenId, token2URI)
    })

    it('reverts if caller is not owner', async () => {
      await expectRevert(nft.updateTokenMetadata(tokenId, token2URI), 'Caller is not the owner')
    })

    it('reverts if caller is not creator', async () => {
      await nft.connect(minter).transferToken(minter.address, receiver.address, tokenId)
      await expectRevert(
        nft.connect(receiver).updateTokenMetadata(tokenId, token2URI),
        'Caller is not the creator'
      )
    })
  })

  describe('Royalties', async () => {
    let tokenId
    beforeEach(async () => {
      await nft.addToWhitelist(minter.address)
      const token = await nft
        .connect(minter)
        .mint(minter.address, token1URI, minter.address, royaltyAmount)
      const txn = await token.wait()
      tokenId = txn.events[0].args.tokenId
    })

    it('sets royalty for specific token upon mint', async () => {
      const txn = await nft.royaltyInfo(tokenId, salePrice)
      const expectedRoyalty = royaltyAmount.mul(salePrice).div(10000)
      expect(txn.receiver).to.equal(minter.address)
      expect(txn.royaltyAmount).to.equal(expectedRoyalty)
    })

    it('allows creator to update token royalties', async () => {
      await nft.connect(minter).updateTokenRoyalty(tokenId, newRoyaltyAmount)
      const expectedRoyalty = newRoyaltyAmount.mul(salePrice).div(10000)
      const info = await nft.royaltyInfo(tokenId, salePrice)
      expect(info.royaltyAmount).to.equal(expectedRoyalty)
    })

    it('reverts if anyone other than the creator tries to change token royalties', async () => {
      await expectRevert(
        nft.updateTokenRoyalty(tokenId, newRoyaltyAmount),
        'Caller is not the creator'
      )
    })

    it('reverts if royalty amount is >10000', async () => {
      await expectRevert(
        nft.connect(minter).updateTokenRoyalty(tokenId, 10001),
        'ERC2981Royalties: Too high'
      )
    })
  })

  describe('Whitelisting', async () => {
    it('allows contract owner to initialise whitelist addresses', async () => {
      await nft.initWhitelist([whitelistAdd1.address, whitelistAdd2.address])
      expect(await nft.isWhitelisted(whitelistAdd1.address)).to.equal(true)
      expect(await nft.isWhitelisted(whitelistAdd2.address)).to.equal(true)
    })
    it('allows anyone to mint when whitelist is disabled', async () => {
      await nft.enableWhitelist(false)
      await nft.connect(minter).mint(minter.address, token1URI, minter.address, royaltyAmount)
    })

    it('allows contract owner to add addresses to the whitelist', async () => {
      await nft.addToWhitelist(whitelistAdd1.address)
      expect(await nft.isWhitelisted(whitelistAdd1.address)).to.equal(true)
    })

    it('allows contract owner to remove addresses from the whitelist', async () => {
      await nft.addToWhitelist(whitelistAdd1.address)
      expect(await nft.isWhitelisted(whitelistAdd1.address)).to.equal(true)
      await nft.removeFromWhitelist(whitelistAdd1.address)
      expect(await nft.isWhitelisted(whitelistAdd1.address)).to.equal(false)
    })

    it('reverts if non-contract owner attempts to initialist whitelist addresses', async () => {
      await expectRevert(
        nft.connect(minter).initWhitelist([whitelistAdd1.address, whitelistAdd2.address]),
        'Ownable: caller is not the owner'
      )
    })

    it('reverts if non-contract owner attempts to disable the whitelist', async () => {
      await expectRevert(
        nft.connect(minter).enableWhitelist(false),
        'Ownable: caller is not the owner'
      )
    })

    it('reverts if non-contract owner attempts to add addresses to whitelist', async () => {
      await expectRevert(
        nft.connect(minter).addToWhitelist(whitelistAdd1.address),
        'Ownable: caller is not the owner'
      )
    })

    it('reverts if non-contract owner attempts to remove addresses from the whitelist', async () => {
      await nft.addToWhitelist(whitelistAdd1.address)
      expect(await nft.isWhitelisted(whitelistAdd1.address)).to.equal(true)
      await expectRevert(
        nft.connect(minter).removeFromWhitelist(whitelistAdd1.address),
        'Ownable: caller is not the owner'
      )
    })
  })
})
