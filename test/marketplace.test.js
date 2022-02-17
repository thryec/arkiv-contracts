const { BN, constants, expectRevert } = require('@openzeppelin/test-helpers')
const { expect } = require('chai')
const { ethers } = require('hardhat')

describe('Marketplace', () => {
  let marketplace
  let nft
  let protocolFee = ethers.BigNumber.from(250)
  let royaltyAmount = ethers.BigNumber.from(500)
  let salePrice = ethers.BigNumber.from(ethers.utils.parseEther('10'))
  const provider = ethers.provider
  const token1URI = 'https://ipfs.io/ipfs/QmXmNSH2dyp5R6dkW5MVhNc7xqV9v3NHWxNXJfCL6CcYxS'
  const token2URI = 'https://ipfs.io/ipfs/QmQ35DkX8HHjhkJe5MsMAd4X51iP3MHV5d5dZoee32J83k'

  beforeEach(async () => {
    ;[contractOwner, seller, buyer] = await ethers.getSigners()
    const Marketplace = await ethers.getContractFactory('Marketplace')
    marketplace = await Marketplace.deploy(protocolFee)
    await marketplace.deployed()

    const NFT = await ethers.getContractFactory('NFT')
    nft = await NFT.deploy(marketplace.address)
    await nft.deployed()
  })

  describe('Deployment', () => {
    it('sets the owner as contract deployer', async () => {
      expect(await marketplace.owner()).to.equal(contractOwner.address)
    })
    it('sets the marketplace fee', async () => {
      expect(await marketplace.protocolFee()).to.equal(protocolFee)
    })
  })

  describe('listItem', () => {
    let tokenId
    let itemId
    beforeEach(async () => {
      await nft.addToWhitelist(seller.address)
      const token = await nft.connect(seller).mint(seller.address, token1URI)
      const txn = await token.wait()
      tokenId = txn.events[0].args.tokenId
    })

    it('allows owner of token to list item for sale', async () => {
      const txn = await marketplace.connect(seller).listItem(nft.address, tokenId, salePrice)
      const receipt = await txn.wait()
      itemId = receipt.events[0].args.itemId
      const item = await marketplace.getItemById(itemId)
      expect(item['isListed']).to.equal(true)
    })

    it('reverts if non-owner attempts to list item', async () => {
      await expectRevert(
        marketplace.listItem(nft.address, tokenId, salePrice),
        'Caller does not own token'
      )
    })
  })

  describe('purchaseItem', () => {
    let tokenId
    let itemId
    const feeToMarketplace = salePrice.mul(protocolFee).div(10000)
    const royaltyToCreator = salePrice.mul(royaltyAmount).div(10000)
    const revenueToSeller = salePrice.sub(feeToMarketplace).sub(royaltyToCreator)

    beforeEach(async () => {
      await nft.addToWhitelist(seller.address)
      const token = await nft.connect(seller).mint(seller.address, token1URI)
      let txn = await token.wait()
      tokenId = txn.events[0].args.tokenId

      txn = await marketplace.connect(seller).listItem(nft.address, tokenId, salePrice)
      const receipt = await txn.wait()
      itemId = receipt.events[0].args.itemId

      await nft.connect(seller).setApprovalForAll(marketplace.address, true)
      await nft.connect(seller).setTokenRoyalty(tokenId, royaltyAmount)
    })

    it('transfers token to buyer', async () => {
      await marketplace.connect(buyer).purchaseItem(nft.address, itemId, { value: salePrice })
      expect(await nft.balanceOf(seller.address)).to.equal(0)
      expect(await nft.balanceOf(buyer.address)).to.equal(1)
    })

    it('transfers sale price to seller of item', async () => {
      const sellerBalance = await provider.getBalance(seller.address)
      await marketplace.connect(buyer).purchaseItem(nft.address, itemId, { value: salePrice })
      const newSellerBalance = await provider.getBalance(seller.address)
      expect(newSellerBalance.sub(sellerBalance)).to.be.gte(revenueToSeller)
    })

    it('transfers royalties to the creator of the token', async () => {
      const creator = await nft.tokenCreator(tokenId)
      const creatorBalance = await provider.getBalance(creator)
      await marketplace.connect(buyer).purchaseItem(nft.address, itemId, { value: salePrice })
      const newCreatorBalance = await provider.getBalance(creator)
      expect(newCreatorBalance.sub(creatorBalance)).to.be.gte(royaltyToCreator)
    })

    it('transfers marketplace fee to contract owner', async () => {
      const marketplaceBalance = await provider.getBalance(contractOwner.address)
      await marketplace.connect(buyer).purchaseItem(nft.address, itemId, { value: salePrice })
      const newMarketplaceBalance = await provider.getBalance(contractOwner.address)
      expect(newMarketplaceBalance.sub(marketplaceBalance)).to.be.gte(feeToMarketplace)
    })

    it('changes item listed status to false', async () => {
      await marketplace.connect(buyer).purchaseItem(nft.address, itemId, { value: salePrice })
      const item = await marketplace.getItemById(itemId)
      expect(item['isListed']).to.equal(false)
    })

    it('sets the new owner of the item as buyer', async () => {
      await marketplace.connect(buyer).purchaseItem(nft.address, itemId, { value: salePrice })
      const item = await marketplace.getItemById(itemId)
      expect(item['owner']).to.equal(buyer.address)
    })

    it('reverts if ether sent does not equal to the salePrice', async () => {
      let incorrectSalePrice = ethers.BigNumber.from(ethers.utils.parseEther('9'))
      await expectRevert(
        marketplace.connect(buyer).purchaseItem(nft.address, itemId, { value: incorrectSalePrice }),
        'Please send the correct amount of ether'
      )
    })

    it('reverts if attempting to buy an unlisted item', async () => {
      await marketplace.connect(seller).delistItem(itemId)
      await expectRevert(
        marketplace.connect(buyer).purchaseItem(nft.address, itemId, { value: salePrice }),
        'Item requested is not for sale.'
      )
    })
  })

  describe('Delisting', () => {
    let tokenId
    let itemId
    beforeEach(async () => {
      await nft.addToWhitelist(seller.address)
      const token = await nft.connect(seller).mint(seller.address, token1URI)
      let txn = await token.wait()
      tokenId = txn.events[0].args.tokenId

      txn = await marketplace.connect(seller).listItem(nft.address, tokenId, salePrice)
      const receipt = await txn.wait()
      itemId = receipt.events[0].args.itemId
    })

    it('successfully delists listed item', async () => {
      await marketplace.connect(seller).delistItem(itemId)
      const item = await marketplace.getItemById(itemId)
      expect(item['isListed']).to.equal(false)
    })

    it('reverts if caller is not the owner of item', async () => {
      await expectRevert(marketplace.delistItem(itemId), 'Caller is not item owner')
    })

    it('reverts if item is not listed', async () => {
      await marketplace.connect(seller).delistItem(itemId)
      await expectRevert(marketplace.connect(seller).delistItem(itemId), 'Item is not listed.')
    })
  })

  describe('Changing item list price', () => {
    let tokenId
    let itemId
    let newPrice = ethers.BigNumber.from(ethers.utils.parseEther('5'))
    beforeEach(async () => {
      await nft.addToWhitelist(seller.address)
      const token = await nft.connect(seller).mint(seller.address, token1URI)
      let txn = await token.wait()
      tokenId = txn.events[0].args.tokenId

      txn = await marketplace.connect(seller).listItem(nft.address, tokenId, salePrice)
      const receipt = await txn.wait()
      itemId = receipt.events[0].args.itemId
    })

    it('updates listing price successfully', async () => {
      await marketplace.connect(seller).updateListPrice(itemId, newPrice)
      const item = await marketplace.getItemById(itemId)
      expect(item['price']).to.equal(newPrice)
    })

    it('reverts if caller is not owner of item', async () => {
      await expectRevert(marketplace.updateListPrice(itemId, newPrice), 'Caller is not item owner')
    })
  })

  describe('Updating marketplace fees', () => {
    let newProtocolFee = ethers.BigNumber.from(150)
    it('updates marketplace fees successfully', async () => {
      await marketplace.updateProtocolFee(newProtocolFee)
      expect(await marketplace.protocolFee()).to.equal(newProtocolFee)
    })

    it('reverts if caller is not owner of marketplace contract', async () => {
      await expectRevert(
        marketplace.connect(seller).updateProtocolFee(newProtocolFee),
        'Ownable: caller is not the owner'
      )
    })
  })

  describe('Querying marketplace items', () => {
    let tokenId1
    let tokenId2
    let itemId1
    let itemId2
    beforeEach(async () => {
      await nft.addToWhitelist(seller.address)
      let token = await nft.connect(seller).mint(seller.address, token1URI)
      let txn = await token.wait()
      tokenId1 = txn.events[0].args.tokenId

      token = await nft.connect(seller).mint(seller.address, token1URI)
      txn = await token.wait()
      tokenId2 = txn.events[0].args.tokenId

      txn = await marketplace.connect(seller).listItem(nft.address, tokenId1, salePrice)
      let receipt = await txn.wait()
      itemId1 = receipt.events[0].args.itemId

      txn = await marketplace.connect(seller).listItem(nft.address, tokenId2, salePrice)
      receipt = await txn.wait()
      itemId2 = receipt.events[0].args.itemId
    })

    it('fetches item details using itemId ', async () => {
      const item1 = await marketplace.getItemById(itemId1)
      const item2 = await marketplace.getItemById(itemId2)
      expect(item1.tokenId).to.equal(tokenId1)
      expect(item2.tokenId).to.equal(tokenId2)
    })

    it('fetches all owned items ', async () => {
      const items = await marketplace.connect(seller).getItemsOwned()
      expect(items.length).to.equal(2)
      expect(items[0].owner).to.equal(seller.address)
      expect(items[1].owner).to.equal(seller.address)
    })

    it('fetches all listed items', async () => {
      let items = await marketplace.connect(seller).getListedItems()
      expect(items.length).to.equal(2)
      await marketplace.connect(seller).delistItem(itemId1)
      items = await marketplace.connect(seller).getListedItems()
      expect(items.length).to.equal(1)
    })
  })
})
