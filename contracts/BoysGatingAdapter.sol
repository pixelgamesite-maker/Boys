// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IBoys {
    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function tokenURI(uint256 tokenId) external view returns (string memory);
    function totalSupply() external view returns (uint256);
}

struct StakeInfo {
    address owner;
    uint40 stakedAt;
    uint40 unlockTime;
    uint40 lastClaimAt;
    uint32 durationDays;
    uint256 rewardRate;
    uint256 claimedReward;
    bool isStaked;
}

interface IJuiceStakingView {
    function getUserStakes(address user) external view returns (uint256[] memory);
    function getStake(uint256 tokenId) external view returns (StakeInfo memory);
}

contract BoysGatingAdapter {

    string public constant name = "BoyMeetsHood (held + staked)";
    string public constant symbol = "BOYS";

    constructor(address _boys, address _staking) {
        boys = IBoys(_boys);
        staking = IJuiceStakingView(_staking);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC-165
            interfaceId == 0x80ac58cd || // ERC-721
            interfaceId == 0x5b5e139f; // ERC-721 Metadata
    }

    function balanceOf(address owner) external view returns (uint256) {
        return boys.balanceOf(owner) + staking.getUserStakes(owner).length;
    }

    function stakedBalanceOf(address owner) external view returns (uint256) {
        return staking.getUserStakes(owner).length;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        StakeInfo memory s = staking.getStake(tokenId);
        if (s.isStaked) return s.owner;
        return boys.ownerOf(tokenId);
    }

    }

    function totalSupply() external view returns (uint256) {
        return boys.totalSupply();
    }
}
