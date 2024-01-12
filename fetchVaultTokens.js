import axios from "axios"
import { writeFileSync } from "fs"
import { createPublicClient, getAddress, http } from "viem"

import { VaultRegistryByChain, networksByChainId, RPC_URLS } from "./utils.js";
import { VaultRegistryAbi } from "./lib/vaultRegistryAbi.js";
import { ERC20Abi } from "./lib/erc20Abi.js";

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