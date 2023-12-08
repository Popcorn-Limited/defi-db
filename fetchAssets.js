import axios from "axios"
import { writeFileSync,readFileSync } from "fs"
import { YieldOptions, CachedProvider } from "vaultcraft-sdk";
import { createPublicClient, getAddress, http } from "viem"
import { arbitrum, mainnet, optimism, polygon } from "viem/chains"
import {ERC20Abi} from "./lib/erc20Abi.js";

const RPC_URLS = {
  [1]: `https://eth-mainnet.alchemyapi.io/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg`,
  [42161]: `https://arb-mainnet.g.alchemy.com/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg`,
  [137]: `https://polygon-mainnet.g.alchemy.com/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg`,
  [10]: `https://opt-mainnet.g.alchemy.com/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg`,
  [56]: `https://bsc-dataseed1.binance.org`,
};

async function getBaseTokens() {
  const { data } = await axios.get("https://enso-scrape.s3.us-east-2.amazonaws.com/output/backend/baseTokens.json")
  return data.map(t => {
    return { address: getAddress(t.address), name: t.name, symbol: t.symbol, decimals: t.decimals, logoURI: t.logoURI, chainId: t.chainId }
  })
}

async function getDefiTokens() {
  const { data } = await axios.get("https://enso-scrape.s3.us-east-2.amazonaws.com/output/backend/defiTokens.json")
  return data.map(t => { return { address: getAddress(t.token.address), name: t.token.name, symbol: t.token.symbol, decimals: t.token.decimals, logoURI: t.protocol.logo, chainId: t.token.chain } })
}

async function getExistingAddresses(chainId) {
  const { data } = await axios.get(`https://raw.githubusercontent.com/Popcorn-Limited/defi-db/main/archive/assets/addresses/${chainId}.json`)
  return data.map(a => getAddress(a))
}

function prepareTokenContract(address) {
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
      functionName: 'decimals'
    }
  ]
}

const EmptyTokenByChain= {
  1: "https://etherscan.io/images/main/empty-token.png",
  1337: "https://etherscan.io/images/main/empty-token.png",
  5: "https://etherscan.io/images/main/empty-token.png",
  137: "https://polygonscan.com/images/main/empty-token.png",
  10: "/images/networks/empty-op.svg",
  42161: "https://arbiscan.io/images/main/empty-token.png",
  56: "/images/networks/empty-bsc.svg",
}

async function getAssets(addresses, chainId, client) {
  const results = await client.multicall({
    contracts: addresses.map(address => prepareTokenContract(address)).flat(),
    allowFailure: false,
  })
  return addresses.map((address, i) => {
    if (i > 0) i = i * 3
    return {
      address: address,
      name: results[i],
      symbol: results[i + 1],
      decimals: results[i + 2],
      logoURI: EmptyTokenByChain[chainId],
      chainId: chainId
    }
  })
}

const IconByProtocol= {
  "balancer": "https://app.vaultcraft.io/images/tokens/balancer-lp.png",
  "curve": "https://app.vaultcraft.io/images/tokens/curve-lp.png",
  "stargate": "https://icons.llamao.fi/icons/protocols/stargate?w=48&h=48",
}

async function getLpAssets(tokens, chainId, protocol, client) {
  const results = await client.multicall({
    contracts: tokens.map(token => prepareTokenContract(token)).flat(),
    allowFailure: false,
  })
  return tokens.map((token, i) => {
    if (i > 0) i = i * 3
    return {
      address: token,
      name: results[i],
      symbol: results[i + 1],
      decimals: results[i + 2],
      logoURI: IconByProtocol[protocol],
      chainId: chainId
    }
  })
}

const chains = [1, 137, 10, 42161]

const networksByChainId = {
  1: mainnet,
  137: polygon,
  10: optimism,
  42161: arbitrum
}

const lpProtocols = ['balancer', "stargate"]

async function getNewAssets(yieldOptions, chainId, ensoAssets) {
  const result = {}
  const existingAddresses = await getExistingAddresses(chainId)

  // Check for duplicate assets in enso
  const filteredEnsoAssets = ensoAssets.filter(asset => asset.chainId === chainId).filter(asset => !existingAddresses.includes(asset.address))
  // Add enso assets to existing addresses
  existingAddresses.push(...filteredEnsoAssets.map(a => a.address))

  const availableProtocols = await yieldOptions.getProtocols(chainId)
  const availableLpProtocols = availableProtocols.map(p => p.key).filter(key => lpProtocols.includes(key))

  // Fetch lp addresses
  let filteredLpTokens = []
  if (availableLpProtocols.length > 0) {
    const lpTokens = await Promise.all(availableLpProtocols.map(async (protocol) => {
      const protocolAssets = await yieldOptions.getProtocolAssets({ chainId, protocol })
      return protocolAssets.map(a => { return { address: a, protocol: protocol } })
    }))

    // Check for duplicate assets in lp addresses
    filteredLpTokens = lpTokens.filter(lp => !existingAddresses.includes(lp.address)).flat()
    // Add lp assets to existing addresses
    existingAddresses.push(...filteredLpTokens.map(lp => lp.address))
  }

  // Fetch yield option asset addresses
  const addresses = await yieldOptions.getAssets(chainId)
  // Check for duplicate assets in yield option assets
  const filteredAddresses = addresses.filter(address => !existingAddresses.includes(address))

  filteredEnsoAssets.forEach(asset => result[asset.address] = asset)

  if (filteredLpTokens.length > 0 || filteredAddresses.length > 0) {
    const client = createPublicClient({
      chain: networksByChainId[chainId],
      transport: http(RPC_URLS[chainId]),
    });
    if (filteredLpTokens.length > 0) {
      const lps = await getLpAssets(filteredLpTokens.map(lp => lp.address), chainId, filteredLpTokens[0].protocol, client)
      lps.forEach(asset => result[asset.address] = asset)
    }
    if (filteredAddresses.length > 0) {
      const tokens = await getAssets(filteredAddresses, chainId, client)
      tokens.forEach(asset => result[asset.address] = asset)
    }
  }
  return { tokens: result, addresses: existingAddresses }
}

async function setUpYieldOptions() {
  const ttl = 360_000;
  const provider = new CachedProvider();
  await provider.initialize("https://raw.githubusercontent.com/Popcorn-Limited/defi-db/main/apy-data.json");
  return new YieldOptions({ provider, ttl });
}

async function main() {
  const yieldOptions = await setUpYieldOptions()
  const baseTokens = await getBaseTokens()
  const defiTokens = await getDefiTokens()

  chains.forEach(async (chainId) => {
    const { tokens, addresses } = await getNewAssets(yieldOptions, chainId, [...baseTokens, ...defiTokens])
    writeFileSync(`./archive/assets/addresses/${chainId}.json`, JSON.stringify(addresses), "utf-8");
    if(Object.keys(tokens).length > 0){
      const data = readFileSync(`./archive/assets/tokens/${chainId}.json`, 'utf8')
      // parse JSON string to JSON object
      const allTokens = JSON.parse(data)

      Object.keys(tokens).forEach(key => allTokens[key] = allTokens[key])
      writeFileSync(`./archive/assets/tokens/${chainId}.json`, JSON.stringify(allTokens), "utf-8");
    }
  })
}

main()


