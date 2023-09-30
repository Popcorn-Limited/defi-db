import { createAnvil, createPool } from "@viem/anvil";
import { YieldOptions, LiveProvider } from "vaultcraft-sdk";
import { createPublicClient, http } from "viem";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "fs";
import dayjs from "dayjs";
import { arbitrum, mainnet, optimism } from "viem/chains";

const MAINNET_URL = "https://eth.llamarpc.com";
const ARBITRUM_URL = "https://arbitrum.llamarpc.com";
const OPTIMISM_URL = "https://optimism.llamarpc.com";

const ARCHIVE_PATH = "./archive";
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
    const arbitrumClient = createClient(arbitrum, ARBITRUM_URL, 8546);
    const optimismClient = createClient(optimism, OPTIMISM_URL, 8547);

    const provider = new LiveProvider(
        {
            1: mainnetClient,
            10: optimismClient,
            42161: arbitrumClient,
        },
        10000,
    );
    const yieldOptions = new YieldOptions(provider, 1000);
    const result = {
        1: await collectApyData(yieldOptions, mainnet.id),
        10: await collectApyData(yieldOptions, optimism.id),
        42161: await collectApyData(yieldOptions, arbitrum.id),
    };

    console.log("stopping anvil instances");
    await anvilPool.stop(mainnet.id);
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

            const protocolData = await yieldOptions.getYieldOptionsByProtocol(chainId, key);
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
