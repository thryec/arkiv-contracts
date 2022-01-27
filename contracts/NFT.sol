//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "hardhat/console.sol";

contract NFT is ERC721, Ownable {
    /// @notice _tokenIds to keep track of the number of NFTs minted
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    /// @notice store tokenURIs for each tokenId
    mapping(uint256 => string) private _uris;

    constructor() ERC721("Gallery Tokens", "GTKNS") {}

    /**
        @notice Mints ERC721 tokens to the caller's wallet. 
        @param tokenURI metadata of the NFT to be minted 
        @return _tokenId of the NFT minted 
    */
    function mintToken(string memory tokenURI)
        public
        returns (uint256 _tokenId)
    {
        _tokenIds.increment();
        uint256 currentTokenId = _tokenIds.current();
        _uris[currentTokenId] = tokenURI;
        _mint(msg.sender, currentTokenId);
        return _tokenId;
    }

    /**
        @notice retrieves the tokenURI corresponding to each tokenId 
        @param _tokenId id number of the requested token
        @return URI of the token 
    */
    function getTokenURI(uint256 _tokenId) public view returns (string memory) {
        return (_uris[_tokenId]);
    }
}
