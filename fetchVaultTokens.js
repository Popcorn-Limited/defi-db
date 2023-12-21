import axios from "axios"
import { writeFileSync } from "fs"
import { createPublicClient, getAddress, http } from "viem"
import { arbitrum, mainnet, optimism, polygon } from "viem/chains"
import { VaultRegistryAbi } from "./lib/vaultRegistryAbi.js";
import { ERC20Abi } from "./lib/erc20Abi.js";

const RPC_URLS = {
  [1]: `https://eth-mainnet.alchemyapi.io/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg`,
  [42161]: `https://arb-mainnet.g.alchemy.com/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg`,
  [137]: `https://polygon-mainnet.g.alchemy.com/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg`,
  [10]: `https://opt-mainnet.g.alchemy.com/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg`,
  [56]: `https://bsc-dataseed1.binance.org`,
};

function prepareTokenContracts(address) {
  const token = {
    address,
    abi: ERC20Abi
  }
  return [
    {
      ...token,
      functionName: 'name',
    },
    {
      ...token,
      functionName: 'symbol',
    },
    {
      ...token,
      functionName: 'decimals',
    },
  ]
}

const networksByChainId = {
  1: mainnet,
  137: polygon,
  10: optimism,
  42161: arbitrum
}

const VaultRegistryByChain = {
  1: "0x007318Dc89B314b47609C684260CfbfbcD412864",
  137: "0x2246c4c469735bCE95C120939b0C078EC37A08D0",
  10: "0xdD0d135b5b52B7EDd90a83d4A4112C55a1A6D23A",
  42161: "0xB205e94D402742B919E851892f7d515592a7A6cC",
}

async function getStuffByChain(chainId) {
  const client = createPublicClient({
    chain: networksByChainId[chainId],
    transport: http(RPC_URLS[chainId]),
  });

  const { data } = await axios.get(`https://raw.githubusercontent.com/Popcorn-Limited/defi-db/main/archive/vaults/tokens/${chainId}.json`)

  const addresses = await client.readContract({
    address: VaultRegistryByChain[chainId],
    abi: VaultRegistryAbi,
    functionName: "getRegisteredAddresses",
  })

  const filteredAddresses = addresses.filter(address => !Object.keys(data).includes(getAddress(address)))
  if (filteredAddresses.length === 0) return []

  const results = await client.multicall({
    contracts: filteredAddresses.map(vault => prepareTokenContracts(vault)).flat(),
    allowFailure: false
  })

  filteredAddresses.forEach((address, i) => {
    if (i > 0) i = i * 3

    data[getAddress(address)] = {
      address: getAddress(address),
      name: results[i],
      symbol: results[i + 1],
      decimals: results[i + 2],
      logoURI: "https://app.vaultcraft.io/images/tokens/vcx.svg",
      chainId: chainId
    }
  })
  return data
}

const chains = [1, 137, 10, 42161]

async function main() {
  for (let i = 0; i < chains.length; i++) {
    const data = await getStuffByChain(chains[i])
    if (Object.keys(data).length > 0) {
      writeFileSync(`./archive/vaults/tokens/${chains[i]}.json`, JSON.stringify(data), "utf-8");
    }
  }
}

main()