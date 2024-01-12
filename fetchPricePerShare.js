import axios from "axios"
import { writeFileSync } from "fs"
import { createPublicClient, getAddress, http } from "viem"
import { arbitrum, mainnet, optimism, polygon } from "viem/chains"
import { VaultAbi } from "./lib/vaultAbi.js";
import { VaultRegistryAbi } from "./lib/vaultRegistryAbi.js";
import { VaultRegistryByChain, networksByChainId, RPC_URLS } from "./utils.js";

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