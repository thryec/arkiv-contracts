//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Counters.sol';
import '@openzeppelin/contracts/utils/math/SafeCast.sol';
import './ERC2981.sol';
import './Whitelist.sol';
import 'hardhat/console.sol';

contract NFT is ERC721URIStorage, Ownable, ERC2981, Whitelist {
  // Event indicating metadata was updated.
  event TokenURIUpdated(uint256 indexed _tokenId, string _uri);

  /// @notice _tokenIds to keep track of the number of NFTs minted
  using Counters for Counters.Counter;
  Counters.Counter private _tokenIds;

  /// @notice for converting royalty values from uint256 to uint96
  using SafeCast for uint256;

  /// @notice address of marketplace contract to set permissions
  address private marketplaceAddress;

  /// @notice maps tokenIds to respective tokenURIs
  mapping(uint256 => string) private _uris;

  /// @notice Maps tokenId to the creator's address
  mapping(uint256 => address) private tokenCreators;

  /// @notice Maps tokenId to the owner's address
  mapping(address => uint256) private owners;

  /// @notice Maps tokenId to royalty information
  mapping(uint256 => RoyaltyInfo) internal _royalties;

  // Array with all token ids, used for enumeration
  uint256[] private _allTokens;

  constructor(address _marketplaceAddress) ERC721('Arkiv', 'ARKV') {
    marketplaceAddress = _marketplaceAddress;
  }

  /// @inheritdoc	ERC165
  function supportsInterface(bytes4 interfaceId)
    public
    view
    virtual
    override(ERC721, ERC2981)
    returns (bool)
  {
    return super.supportsInterface(interfaceId);
  }

  // ------------------ Mutative Functions ---------------------- //

  function mint(address to, string memory tokenURI) public returns (uint256 _tokenId) {
    bytes memory uri = bytes(tokenURI);
    require(isWhitelisted(msg.sender), 'Must be whitelisted to create tokens');
    require(uri.length != 0, 'ERC721: tokenURI is empty');

    uint256 currentTokenId = _tokenIds.current();

    _safeMint(to, currentTokenId);
    _setTokenURI(currentTokenId, tokenURI);
    tokenCreators[currentTokenId] = msg.sender;
    setApprovalForAll(marketplaceAddress, true);

    _allTokens.push(currentTokenId);
    _tokenIds.increment();
    return currentTokenId;
  }

  function burn(uint256 _tokenId) public onlyTokenOwner(_tokenId) onlyTokenCreator(_tokenId) {
    _burn(_tokenId);
  }

  /**
   * @dev Updates the token metadata if the owner is also the
   *      creator.
   * @param _tokenId uint256 ID of the token.
   * @param _uri string metadata URI.
   */
  function updateTokenMetadata(uint256 _tokenId, string memory _uri)
    public
    onlyTokenOwner(_tokenId)
    onlyTokenCreator(_tokenId)
  {
    _setTokenURI(_tokenId, _uri);
    emit TokenURIUpdated(_tokenId, _uri);
  }

  function transferToken(
    address from,
    address to,
    uint256 tokenId
  ) public {
    transferFrom(from, to, tokenId);
  }

  /// @dev Sets token royalties
  /// @param tokenId the token id fir which we register the royalties
  /// @param value percentage (using 2 decimals - 10000 = 100, 0 = 0)
  function setTokenRoyalty(uint256 tokenId, uint256 value)
    public
    onlyTokenCreator(tokenId)
    onlyTokenOwner(tokenId)
  {
    if (value > 0) {
      uint96 royaltyValue = toUint96(value);
      _setTokenRoyalty(tokenId, msg.sender, royaltyValue);
    }
  }

  /**
   * @dev Whitelists a bunch of addresses.
   * @param _whitelistees address[] of addresses to whitelist.
   */
  function initWhitelist(address[] memory _whitelistees) public onlyOwner {
    for (uint256 i = 0; i < _whitelistees.length; i++) {
      address creator = _whitelistees[i];
      if (!isWhitelisted(creator)) {
        _whitelist(creator);
      }
    }
  }

  // ----------------------- Pure Functions --------------------------- //
  function toUint96(uint256 a) public pure returns (uint96) {
    return a.toUint96();
  }

  // ----------------------- Read Functions --------------------------- //

  /**
   * @dev Gets the creator of the token.
   * @param _tokenId uint256 ID of the token.
   * @return address of the creator.
   */
  function tokenCreator(uint256 _tokenId) public view returns (address) {
    return tokenCreators[_tokenId];
  }

  function getMarketAddress() public view returns (address marketAddress) {
    return marketplaceAddress;
  }

  function totalSupply() public view virtual returns (uint256) {
    return _allTokens.length;
  }

  // ----------------------- Modifiers --------------------------- //

  /**
   * @dev Checks that the token is owned by the sender.
   * @param _tokenId uint256 ID of the token.
   */
  modifier onlyTokenOwner(uint256 _tokenId) {
    address owner = ownerOf(_tokenId);
    require(owner == msg.sender, 'Caller is not the owner');
    _;
  }

  /**
   * @dev Checks that the token was created by the sender.
   * @param _tokenId uint256 ID of the token.
   */
  modifier onlyTokenCreator(uint256 _tokenId) {
    address creator = tokenCreator(_tokenId);
    require(creator == msg.sender, 'Caller is not the creator');
    _;
  }
}
