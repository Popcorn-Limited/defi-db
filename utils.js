import { mainnet, polygon, optimism, arbitrum } from "viem/chains";
export const VaultRegistryByChain = {
    1: "0x007318Dc89B314b47609C684260CfbfbcD412864",
    137: "0x2246c4c469735bCE95C120939b0C078EC37A08D0",
    10: "0xdD0d135b5b52B7EDd90a83d4A4112C55a1A6D23A",
    42161: "0xB205e94D402742B919E851892f7d515592a7A6cC",
};

export const networksByChainId = {
    1: mainnet,
    137: polygon,
    10: optimism,
    42161: arbitrum
}

export const RPC_URLS = {
    [1]: `https://eth-mainnet.alchemyapi.io/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg`,
    [42161]: `https://arb-mainnet.g.alchemy.com/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg`,
    [137]: `https://polygon-mainnet.g.alchemy.com/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg`,
    [10]: `https://opt-mainnet.g.alchemy.com/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg`,
    [56]: `https://bsc-dataseed1.binance.org`,
};

