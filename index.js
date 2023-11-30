import { createPool } from "@viem/anvil";
import { YieldOptions, LiveProvider } from "vaultcraft-sdk";
import { createPublicClient, http } from "viem";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "fs";
import dayjs from "dayjs";
import { mainnet, polygon, arbitrum, optimism } from "viem/chains";

const MAINNET_URL = "https://eth-mainnet.alchemyapi.io/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg";
const POLYGON_URL = "https://polygon-mainnet.g.alchemy.com/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg";
const ARBITRUM_URL = "https://arb-mainnet.alchemyapi.io/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg";
const OPTIMISM_URL = "https://opt-mainnet.alchemyapi.io/v2/KsuP431uPWKR3KFb-K_0MT1jcwpUnjAg";

const ARCHIVE_PATH = "./archive/apy";
const anvilPool = createPool();
(async () => {
  console.log("moving current file to archive");
  const date = dayjs().subtract(1, "day").format("YYYY-MM-DD");

  if (!existsSync(ARCHIVE_PATH)) {
    mkdirSync(ARCHIVE_PATH);
  }
  renameSync("./apy-data.json", `${ARCHIVE_PATH}/${date}.json`);

  // we use a local anvil instance to decrease the number of RPC requests sent to a public endpoint.
  const mainnetClient = await createClient(mainnet, MAINNET_URL, 8545);
  const polygonClient = await createClient(polygon, POLYGON_URL, 8546);
  const arbitrumClient = await createClient(arbitrum, ARBITRUM_URL, 8547);
  const optimismClient = await createClient(optimism, OPTIMISM_URL, 8548);

  const provider = new LiveProvider(
    {
      clients: {
        1: mainnetClient,
        137: polygonClient,
        10: optimismClient,
        42161: arbitrumClient,
      },
      ttl: 10_000
    }
  );

  const yieldOptions = new YieldOptions({ provider, ttl: 10_000 });
  const result = {
    1: await collectApyData(yieldOptions, mainnet.id),
    137: await collectApyData(yieldOptions, polygon.id),
    10: await collectApyData(yieldOptions, optimism.id),
    42161: await collectApyData(yieldOptions, arbitrum.id),
  };

  console.log("stopping anvil instances");
  await anvilPool.stop(mainnet.id);
  await anvilPool.stop(polygon.id);
  await anvilPool.stop(arbitrum.id);
  await anvilPool.stop(optimism.id);

  console.log("saving result in apy-data.json");
  writeFileSync("./apy-data.json", JSON.stringify(result), "utf-8");
})();

async function createClient(chain, forkUrl, port) {
  await anvilPool.start(chain.id, {
    port,
    forkUrl,
  });
  const anvilChain = {
    ...chain,
    rpcUrls: {
      default: {
        http: [`http://127.0.0.1:${port}`],
      },
      public: {
        http: [`http://127.0.0.1:${port}`],
      },
    },
  };
  const client = createPublicClient({
    chain: anvilChain,
    transport: http(),
  });

  return client;
}

async function collectApyData(yieldOptions, chainId) {
  console.log("collecting APY data for chain: ", chainId);
  const result = {};
  for (const { key } of yieldOptions.getProtocols(chainId)) {
    console.log(`pulling yield data for ${key}`);
    result[key] = {};
    try {
      const protocolData = await yieldOptions.getYieldOptionsByProtocol({ chainId, protocol: key });
      protocolData.forEach((data) => {
        result[key][data.asset] = data.yield;
      });
    } catch (e) {
      console.log("failed to pull yield data for ", key);
      console.error(e);
    }
  }

  return result;
}
