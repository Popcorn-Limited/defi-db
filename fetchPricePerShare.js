import axios from "axios"
import { writeFileSync } from "fs"
import { createPublicClient, getAddress, http } from "viem"
import { arbitrum, mainnet, optimism, polygon } from "viem/chains"
import { VaultAbi } from "./lib/vaultAbi.js";
import { VaultRegistryAbi } from "./lib/vaultRegistryAbi.js";

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
    abi: VaultAbi
  }
  return [
    {
      ...token,
      functionName: 'totalAssets',
    },
    {
      ...token,
      functionName: 'totalSupply',
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

async function getStuffByChain(chainId, date) {
  const client = createPublicClient({
    chain: networksByChainId[chainId],
    transport: http(RPC_URLS[chainId]),
  });

  const { data } = await axios.get(`https://raw.githubusercontent.com/Popcorn-Limited/defi-db/main/archive/vaults/pricePerShare/${chainId}.json`)

  const addresses = await client.readContract({
    address: VaultRegistryByChain[chainId],
    abi: VaultRegistryAbi,
    functionName: "getRegisteredAddresses",
  })

  const results = await client.multicall({
    contracts: addresses.map(vault => prepareTokenContracts(vault)).flat(),
    allowFailure: false
  })

  addresses.forEach((address, i) => {
    if (i > 0) i = i * 2

    const totalAssets = Number(results[i]);
    const totalSupply = Number(results[i + 1])
    const assetsPerShare = totalSupply > 0 ? (totalAssets + 1) / (totalSupply + (1e9)) : Number(1e-9)

    if (!Object.keys(data).includes(getAddress(address))) {
      data[getAddress(address)] = {
        totalAssets: [{ date: date, value: totalAssets }],
        totalSupply: [{ date: date, value: totalSupply }],
        pricePerShare: [{ date: date, value: assetsPerShare }]
      }
    } else {
      data[getAddress(address)].totalAssets.unshift({ date: date, value: totalAssets })
      data[getAddress(address)].totalSupply.unshift({ date: date, value: totalSupply })
      data[getAddress(address)].pricePerShare.unshift({ date: date, value: assetsPerShare })
    }
  })

  return data
}

const chains = [1, 137, 10, 42161]

async function main() {
  const now = Number(new Date())

  for (let i = 0; i < chains.length; i++) {
    const data = await getStuffByChain(chains[i], now)
    writeFileSync(`./archive/vaults/pricePerShare/${chains[i]}.json`, JSON.stringify(data), "utf-8");
  }
}

main()