import { createAnvil } from "@viem/anvil";
import { YieldOptions, LiveProvider } from "vaultcraft-sdk";
import { createPublicClient, http } from "viem";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "fs";
import dayjs from "dayjs";
import { mainnet } from "viem/chains";

const ARCHIVE_PATH = "./archive";
(async () => {
  console.log("moving current file to archive");
  const date = dayjs().subtract(1, "day").format("YYYY-MM-DD");

  if (!existsSync(ARCHIVE_PATH)) {
    mkdirSync(ARCHIVE_PATH);
  }
  renameSync("./apy-data.json", `${ARCHIVE_PATH}/${date}.json`);

  // we use a local anvil instance to decrease the number of RPC requests sent to a public endpoint.
  const anvil = createAnvil({
    forkUrl: "https://eth.llamarpc.com",
  });
  const anvilChain = {
    ...mainnet,
    id: 1337,
    rpcUrls: {
      default: {
        http: [`http://127.0.0.1:8545`],
      },
      public: {
        http: [`http://127.0.0.1:8545`],
      },
    },
  };
  const publicClient = createPublicClient({
    chain: anvilChain,
    transport: http(),
  });
  console.log("starting anvil instance");
  await anvil.start();

  const provider = new LiveProvider({ 1: publicClient }, 10000);
  const yieldOptions = new YieldOptions(provider, 1000);
  const result = {
    1: {},
  };
  for (const { name, key, logoURI, description, tags } of provider.getProtocols(
    1
  )) {
    console.log(`pulling yield data for ${key}`);
    result[1][key] = {};
    try {
      const protocolData = await yieldOptions.getYieldOptionsByProtocol(
        1,
        key
      );
      protocolData.forEach((data) => {
        result[1][key][data.asset] = data.yield;
      });
    } catch (e) {
      console.log("failed to pull yield data for ", key);
      console.error(e);
    }
  }
  console.log("stopping anvil instance");
  await anvil.stop();

  console.log("saving result in apy-data.json");
  writeFileSync("./apy-data.json", JSON.stringify(result), "utf-8");
})();
