import { writeFileSync } from "fs"
import { createPublicClient, http } from "viem"
import { arbitrum, mainnet, optimism, polygon } from "viem/chains"
import axios from "axios";
import { ERC20Abi } from "./lib/erc20Abi.js";

function addGenericStrategyDescription(key, symbol) {
  switch (key) {
    case "lpCompounding":
      return `**${symbol} LP-Compounding** \- The vault stakes the user\'s LP Token in a ${symbol} gauge, earning the platform\'s governance token. Earned token is swapped for more LP Token. To complete the compounding cycle, the new LP Token is added to the farm, ready to go for the next earning event. The transaction cost required to do all this is socialized among the vault's users.`
    case "compoundFolding":
      return `**Compound Folding** \- The ${symbol} Smartt Vault supplies and borrows DAI on Compound Finance simultaneously to earn COMP. Flashmints are then used to mint ${symbol} from MakerDAO to flashlend and fold the position to boost APY. Earned tokens are then harvested, sold for more ${symbol}, and then deposited back into the strategy.`
    case "lending":
      return `**Lending** \- The vault supplies assets into ${symbol} to earn interest.`
    case "automatedAssetStrategy":
      return `**Automated Asset Strategy** \- The vault supplies assets into ${symbol} to earn yield on their automated asset strategies.`
    case "seniorTranche":
      return `**Senior Tranche** \- The vault supplies assets into a of ${symbol}.s offer stable returns with built-in coverage but reduced upside.`
    case "juniorTranche":
      return `**Junior Tranche** \- The vault supplies assets into a of ${symbol}.s offer higher returns but with higher risk since they minize the risk of the corresponding.`
    default:
      return ""
  }
}

function addLpMetadata(key, symbol) {
  switch (key) {
    case "stargate":
      return `This ${symbol} LP is a Stargate LP token that is used to facilitate cross-chain bridging. Each ${symbol} LP is backed by ${symbol} in Stargate pools on various chains.`
    case "hop":
      return `This ${symbol} LP is a Hop LP token that is used to facilitate cross-chain bridging. Each ${symbol} LP is backed by ${symbol} in Hop pools on various chains.`
    case "stableLp":
      return `This is a Liquidity Pool Token for a stable pool on ${symbol}. Both assets are pegged to each other. It contains an equal amount of included assets.`
  }
}

function getStargateMetadata(name) {
  return {
    name: "Stargate", description: addGenericStrategyDescription("lpCompounding", "Stargate"), resolver: "stargate"
  }
}

function getConvexMetadata(name) {
  return {
    name: "Convex", description: addGenericStrategyDescription("lpCompounding", "Convex"), resolver: "convex",
  }
}

function getAaveV2Metadata(name) {
  return {
    name: "Aave", description: addGenericStrategyDescription("lending", "AaveV2"), resolver: "aaveV2",
  }
}

function getAaveV3Metadata(name) {
  return {
    name: "Aave", description: addGenericStrategyDescription("lending", "AaveV3"), resolver: "aaveV3",
  }
}

function getAuraMetadata(name) {
  return {
    name: "Aura", description: addGenericStrategyDescription("lpCompounding", "Aura"), resolver: "aura",
  }
}

function getCompoundV2Metadata(name) {
  return {
    name: "Compound", description: addGenericStrategyDescription("lending", "CompoundV2"), resolver: "compoundV2",
  }
}

function getCompoundV3Metadata(name) {
  return { name: "Compound", description: addGenericStrategyDescription("lending", "CompoundV3"), resolver: "compoundV3", }
}

function getFluxMetadata(name) {
  return { name: "Flux", description: addGenericStrategyDescription("lending", "Flux"), resolver: "flux" }
}

function getBeefyMetadata(name) {
  return { name: "Beefy", description: addGenericStrategyDescription("automatedAssetStrategy", "Beefy"), resolver: "beefy" }
}

function getYearnMetadata(name) {
  return { name: "Yearn", description: addGenericStrategyDescription("automatedAssetStrategy", "Yearn"), resolver: "yearn" }
}

function getIdleMetadata(name) {
  return {
    ...name.includes("Senior") ?
      { name: "Idle", description: addGenericStrategyDescription("seniorTranche", "Idle") } :
      { name: "Idle", description: addGenericStrategyDescription("juniorTranche", "Idle") },
    resolver: name.includes("Senior") ? "idleSenior" : "idleJunior",
  }
}

function getOriginMetadata(name) {
  return {
    ...name.includes("Ether") ?
      {
        name: "Origin",
        description: `OUSD integrates with Aave and Compound to automate yield on over-collateralized loans.
    ----
    The OUSD protocol also routes USDT, USDC, and DAI to highly-performing liquidity pools as determined by trading volume and rewards tokens (e.g. Curve rewards CRV tokens to liquidity providers). Yields are then passed on to OUSD holders.
    ---
    In addition to collecting interest from and fees from market making, the protocol automatically claims and converts bonus incentives that are being distributed by DeFi protocols.`} :
      {
        name: "Origin",
        description: `OETH integrates with various Liquid Staking Provider to optimize interest earned by staking Ether.
      ----
      The OETH protocol also utilizes Curve and Convex Finance to earn trading fees and additional rewards on ETH / OETH. It automatically claims and converts bonus incentives that are being distributed by these protocols.`
      },
    resolver: "origin"
  }
}

function getPirexMetadata(name) {
  return { name: "Pirex", description: addGenericStrategyDescription("automatedAssetStrategy", "Pirex"), resolver: "pirex" }
}

function getSommelierMetadata(name) {
  return { name: "Sommelier", description: addGenericStrategyDescription("automatedAssetStrategy", "Sommelier"), resolver: "sommelier" }
}

function getEmptyMetadata(name) {
  return { name: "Strategy", description: "Not found", resolver: "none" }
}

const EXCEPTIONS = {
  "0xE3267A9Ff2d38B748B6aA202e006F7d94Ca22df3": {
    name: "Sommelier Turbo",
    description: "Sommelier Turbo",
    resolver: "sommelier"
  }
}

function getFactoryMetadata({ address, name }) {
  if (Object.keys(EXCEPTIONS).includes(address)) {
    return EXCEPTIONS[address]
  }
  const strategyPrefix = name.split(" ")[1]
  switch (strategyPrefix) {
    case "Stargate":
      return getStargateMetadata(name)
    case "Convex":
      return getConvexMetadata(name)
    case "AaveV2":
      return getAaveV2Metadata(name)
    case "AaveV3":
      return getAaveV3Metadata(name)
    case "Aura":
      return getAuraMetadata(name)
    case "CompoundV2":
      return getCompoundV2Metadata(name)
    case "CompoundV3":
      return getCompoundV3Metadata(name)
    case "Flux":
      return getFluxMetadata(name)
    case "Beefy":
      return getBeefyMetadata(name)
    case "Yearn":
      return getYearnMetadata(name)
    case "Idle":
      return getIdleMetadata(name)
    case "Origin":
      return getOriginMetadata(name)
    case "Ousd":
      return getOriginMetadata(name)
    case "Pirex":
      return getPirexMetadata(name)
    default:
      return getEmptyMetadata(name)
  }
}

const RPC_URLS = {
  [1]: `https://eth-mainnet.alchemyapi.io/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg`,
  [42161]: `https://arb-mainnet.g.alchemy.com/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg`,
  [137]: `https://polygon-mainnet.g.alchemy.com/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg`,
  [10]: `https://opt-mainnet.g.alchemy.com/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg`,
  [56]: `https://bsc-dataseed1.binance.org`,
};

const networksByChainId = {
  1: mainnet,
  137: polygon,
  10: optimism,
  42161: arbitrum
}

async function getStuffByChain(chainId) {
  const client = createPublicClient({
    chain: networksByChainId[chainId],
    transport: http(RPC_URLS[chainId]),
  });

  const { data: vaultData } = await axios.get(`https://raw.githubusercontent.com/Popcorn-Limited/defi-db/main/archive/vaults/${chainId}.json`)
  const { data: strategyData } = await axios.get(`https://raw.githubusercontent.com/Popcorn-Limited/defi-db/main/archive/descriptions/strategies/${chainId}.json`)

  const filteredStrategies = Object.values(vaultData).map((vault) => vault.strategies).flat().filter((strategy) => !Object.keys(strategyData).includes(strategy))

  // if not in data -> fetch base data
  if (filteredStrategies.length > 0) {
    const names = await client.multicall({
      contracts: filteredStrategies.map((strategy) => {
        return {
          address: strategy,
          abi: ERC20Abi,
          functionName: 'name',
        }
      }),
      allowFailure: false
    })

    filteredStrategies.forEach((address, i) => {
      const metadata = getFactoryMetadata({ address, name: names[i] })
      strategyData[address] = {
        address: address,
        ...metadata
      }
    })
  }

  return strategyData
}

const chains = [1, 137, 10, 42161]

async function main() {
  for (let i = 0; i < chains.length; i++) {
    const data = await getStuffByChain(chains[i])
    writeFileSync(`./archive/descriptions/strategies/${chains[i]}.json`, JSON.stringify(data), "utf-8");
  }
}


main()