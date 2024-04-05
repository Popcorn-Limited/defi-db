import axios from "axios";
import dayjs from "dayjs";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "fs";
import { createPublicClient, http } from "viem";

import { networksByChainId, RPC_URLS, networkMap } from "./utils.js";
import { GaugeControllerAbi } from "./lib/gaugeControllerAbi.js";
import { GaugeAbi } from "./lib/gaugeAbi.js";
import { VaultAbi } from "./lib/vaultAbi.js";

const HIDDEN_GAUGES = [
  "0x38098e3600665168eBE4d827D24D0416efC24799", // Deployment script ran out of gas and somehow added a random address into the gauges which now breaks these calls
  "0xF4c8736c1cf9b03ccB09DA6e8A8312E75CA5B529", // Failed Op Gauge Test
];

const GaugeControllerAddress = "0xD57d8EEC36F0Ba7D8Fd693B9D97e02D8353EB1F4";

const clientByChainId = {
  1: createPublicClient({
    chain: networksByChainId[1],
    transport: http(RPC_URLS[1]),
  }),
  10: createPublicClient({
    chain: networksByChainId[10],
    transport: http(RPC_URLS[10]),
  }),
  42161: createPublicClient({
    chain: networksByChainId[42161],
    transport: http(RPC_URLS[421611]),
  }),
};

const gaugeTypeToChainId = {
  0: 1,
  1: 1,
  2: 1,
  3: 10,
  4: 42161,
};

const CHILD_GAUGE_TYPES = [3, 4];

const ARCHIVE_PATH = "./archive/gauge-apy";

(async () => {
  console.log("moving current file to archive");
  const date = dayjs().subtract(1, "day").format("YYYY-MM-DD");
  if (!existsSync(ARCHIVE_PATH)) {
    mkdirSync(ARCHIVE_PATH);
  }
  renameSync("./gauge-apy-data.json", `${ARCHIVE_PATH}/${date}.json`);

  const nGauges = await clientByChainId[1].readContract({
    address: GaugeControllerAddress,
    abi: GaugeControllerAbi,
    functionName: "n_gauges",
  });

  let gauges = await clientByChainId[1].multicall({
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

  gauges = gauges.filter((gauge) => !HIDDEN_GAUGES.includes(gauge));

  const areGaugesKilled = await clientByChainId[1].multicall({
    contracts: gauges.map((gauge) => {
      return {
        address: gauge,
        abi: GaugeAbi,
        functionName: "is_killed",
      };
    }),
    allowFailure: false,
  });

  gauges = gauges?.filter((gauge, idx) => !areGaugesKilled[idx]);

  const gaugeTypes = await clientByChainId[1].multicall({
    contracts: gauges.map((address) => {
      return {
        address: GaugeControllerAddress,
        abi: GaugeControllerAbi,
        functionName: "gauge_types",
        args: [address],
      };
    }),
    allowFailure: false,
  });

  const finalGaugeData = {};

  await Promise.all(
    gauges.map(async (gauge, i) => {
      const gaugeType = Number(gaugeTypes[i]);
      const gaugeData = await getGaugeData(gauge, gaugeType);
      const apy = await calculateGaugeApr(
        gaugeData,
        gaugeTypeToChainId[gaugeType]
      );

      finalGaugeData[gauge] = {
        address: gauge,
        vault: gaugeData.vault,
        lowerAPR: apy.lowerAPR,
        upperAPR: apy.upperAPR,
      };
    })
  );

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

async function getTokenPrice(token, chainId) {
  const key = `${networkMap[chainId].toLowerCase()}:${token}`;

  const { data } = await axios.get(
    `https://coins.llama.fi/prices/current/${key}?searchWidth=24h`
  );
  return data.coins[key]?.price;
}

async function getVCXPrice() {
  const { data: vcxPriceRes } = await axios.get(
    "https://api.dexscreener.com/latest/dex/pairs/ethereum/0x577a7f7ee659aa14dc16fd384b3f8078e23f1920000200000000000000000633-0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2-0xcE246eEa10988C495B4A90a905Ee9237a0f91543"
  );
  return Number(vcxPriceRes.pair.priceUsd);
}

async function getVaultAssetPrice(vault, chainId) {
  const asset = await clientByChainId[chainId].readContract({
    address: vault,
    abi: VaultAbi,
    functionName: "asset",
  });

  return await getTokenPrice(asset, chainId);
}

async function calculateGaugeApr(gaugeData, chainId) {
  const vaultAssetPriceInUsd = await getVaultAssetPrice(
    gaugeData.vault,
    chainId
  );
  const vcxPriceInUsd = await getVCXPrice();

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

async function getGaugeData(gauge, gaugeType) {
  const gaugeContract = {
    address: gauge,
    abi: GaugeAbi,
  };

  const isChildGauge = CHILD_GAUGE_TYPES.includes(gaugeType);

  let data = [];
  if (isChildGauge) {
    data = await clientByChainId[1].multicall({
      contracts: [
        {
          ...gaugeContract,
          functionName: "inflation_params", // root
        },
        {
          ...gaugeContract,
          functionName: "getCappedRelativeWeight", // root
          args: [BigInt(thisPeriodTimestamp())],
        },
      ],
      allowFailure: false,
    });
    const childData = await clientByChainId[
      gaugeTypeToChainId[gaugeType]
    ].multicall({
      contracts: [
        {
          ...gaugeContract,
          functionName: "tokenless_production", // child
        },
        {
          ...gaugeContract,
          functionName: "decimals", // child
        },
        {
          ...gaugeContract,
          functionName: "lp_token", // child
        },
        {
          ...gaugeContract,
          functionName: "working_supply", // child
        },
      ],
      allowFailure: false,
    });
    data.push(...childData);
  } else {
    data = await clientByChainId[1].multicall({
      contracts: [
        {
          ...gaugeContract,
          functionName: "inflation_rate", // root
        },
        {
          ...gaugeContract,
          functionName: "getCappedRelativeWeight", // root
          args: [BigInt(thisPeriodTimestamp())],
        },
        {
          ...gaugeContract,
          functionName: "tokenless_production", // root
        },
        {
          ...gaugeContract,
          functionName: "decimals", // root
        },
        {
          ...gaugeContract,
          functionName: "lp_token", // root
        },
        {
          ...gaugeContract,
          functionName: "working_supply", // root
        },
      ],
      allowFailure: false,
    });
  }

  return {
    vault: data[4],
    inflationRate: Number(isChildGauge ? data[0].rate : data[0]) / 1e18,
    cappedRelativeWeight: Number(data[1]) / 1e18,
    tokenlessProduction: Number(data[2]),
    workingSupply: Number(data[5]) / 10 ** Number(data[3]),
    decimals: Number(data[3]),
  };
}
