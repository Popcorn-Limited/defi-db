import axios from "axios";
import dayjs from "dayjs";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "fs";
import { createPublicClient, http } from "viem";

import { networksByChainId, RPC_URLS } from "./utils.js";
import { GaugeControllerAbi } from "./lib/gaugeControllerAbi.js";
import { GaugeAbi } from "./lib/gaugeAbi.js";
import { VaultAbi } from "./lib/vaultAbi.js";

const GaugeControllerAddress = "0xD57d8EEC36F0Ba7D8Fd693B9D97e02D8353EB1F4";

const client = createPublicClient({
  chain: networksByChainId[1],
  transport: http(RPC_URLS[1]),
});

const ARCHIVE_PATH = "./archive/gauge-apy";

(async () => {
  console.log("moving current file to archive");
  const date = dayjs().subtract(1, "day").format("YYYY-MM-DD");
  if (!existsSync(ARCHIVE_PATH)) {
    mkdirSync(ARCHIVE_PATH);
  }
  renameSync("./gauge-apy-data.json", `${ARCHIVE_PATH}/${date}.json`);

  const nGauges = await client.readContract({
    address: GaugeControllerAddress,
    abi: GaugeControllerAbi,
    functionName: "n_gauges",
  });

  let gauges = await client.multicall({
    contracts: Array(Number(nGauges))
      .fill(undefined)
      .map((item, idx) => {
        return {
          address: GaugeControllerAddress,
          abi: GaugeControllerAbi,
          functionName: "gauges",
          args: [idx],
        };
      }),
    allowFailure: false,
  });
  // deployment script ran out of gas and somehow added a random address into the gauges which now breaks these calls
  gauges = gauges.filter(
    (gauge) => gauge !== "0x38098e3600665168eBE4d827D24D0416efC24799"
  );

  const areGaugesKilled = await client.multicall({
    contracts: gauges.map((gauge) => {
      return {
        address: gauge,
        abi: GaugeAbi,
        functionName: "is_killed",
      };
    }),
    allowFailure: false,
  });

  const aliveGauges = gauges?.filter((gauge, idx) => !areGaugesKilled[idx]);

  const finalGaugeData = {};

  for (let gauge of aliveGauges) {
    const gaugeData = await getGaugeData(gauge);
    const apy = await calculateGaugeApr(gaugeData);

    finalGaugeData[gauge] = {
      address: gauge,
      vault: gaugeData.vault,
      lowerAPR: apy.lowerAPR,
      upperAPR: apy.upperAPR,
    };
  }
  writeFileSync(
    "./gauge-apy-data.json",
    JSON.stringify(finalGaugeData),
    "utf-8"
  );
})();

function thisPeriodTimestamp() {
  const week = 604800 * 1000;
  return (Math.floor(Date.now() / week) * week) / 1000;
}

async function getTokenPrice(token) {
  const { data } = await axios.get(
    `https://coins.llama.fi/prices/current/ethereum:${token}`
  );
  return data.coins[`ethereum:${token}`]?.price;
}

async function getVaultAssetPrice(vault) {
  const asset = await client.readContract({
    address: vault,
    abi: VaultAbi,
    functionName: "asset",
  });

  return await getTokenPrice(asset);
}

async function calculateGaugeApr(gaugeData) {
  const vaultAssetPriceInUsd = await getVaultAssetPrice(gaugeData.vault);
  const vcxPriceInUsd = await getTokenPrice(
    "0xcE246eEa10988C495B4A90a905Ee9237a0f91543"
  );
  // calculate the lowerAPR and upperAPR
  let lowerAPR = 0;
  let upperAPR = 0;
  // 25% discount for oVCX
  const oVcxPriceUSD = vcxPriceInUsd * 0.25;

  const relative_inflation =
    gaugeData.inflationRate * gaugeData.cappedRelativeWeight;
  if (relative_inflation > 0) {
    const annualRewardUSD = relative_inflation * 86400 * 365 * oVcxPriceUSD;
    const workingSupplyUSD =
      (gaugeData.workingSupply > 0 ? gaugeData.workingSupply : 1e18) *
      vaultAssetPriceInUsd;

    lowerAPR =
      annualRewardUSD /
      workingSupplyUSD /
      (100 / gaugeData.tokenlessProduction);
    upperAPR = annualRewardUSD / workingSupplyUSD;
  }

  return {
    lowerAPR: lowerAPR * 100,
    upperAPR: upperAPR * 100,
  };
}

async function getGaugeData(gauge) {
  const gaugeContract = {
    address: gauge,
    abi: GaugeAbi,
  };

  const data = await client.multicall({
    contracts: [
      {
        ...gaugeContract,
        functionName: "lp_token",
      },
      {
        ...gaugeContract,
        functionName: "inflation_rate",
      },
      {
        ...gaugeContract,
        functionName: "getCappedRelativeWeight",
        args: [BigInt(thisPeriodTimestamp())],
      },
      {
        ...gaugeContract,
        functionName: "tokenless_production",
      },
      {
        ...gaugeContract,
        functionName: "working_supply",
      },
      {
        ...gaugeContract,
        functionName: "decimals",
      },
    ],
    allowFailure: false,
  });

  return {
    vault: data[0],
    inflationRate: Number(data[1]) / 1e18,
    cappedRelativeWeight: Number(data[2]) / 1e18,
    tokenlessProduction: Number(data[3]),
    workingSupply: Number(data[4]) / 10 ** Number(data[5]),
    decimals: Number(data[5]),
  };
}
