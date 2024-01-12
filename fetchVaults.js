import axios from "axios"
import { writeFileSync } from "fs"
import { createPublicClient, getAddress, http } from "viem"

import { VaultRegistryByChain, networksByChainId, RPC_URLS } from "./utils.js";
import { VaultRegistryAbi } from "./lib/vaultRegistryAbi.js";
import { VaultAbi } from "./lib/vaultAbi.js";

async function getStuffByChain(chainId) {
  const client = createPublicClient({
    chain: networksByChainId[chainId],
    transport: http(RPC_URLS[chainId]),
  });

  const { data } = await axios.get(
    `https://raw.githubusercontent.com/Popcorn-Limited/defi-db/main/archive/vaults/${chainId}.json`
  );

  const addresses = await client.readContract({
    address: VaultRegistryByChain[chainId],
    abi: VaultRegistryAbi,
    functionName: "getRegisteredAddresses",
  });
  const newAddresses = addresses
    .filter((address) => !Object.keys(data).includes(getAddress(address)))
    .map((address) => getAddress(address));

  // if not in data -> fetch base data
  if (newAddresses.length > 0) {
    const assets = await client.multicall({
      contracts: newAddresses.map((vault) => {
        return {
          address: vault,
          abi: VaultAbi,
          functionName: "asset",
        };
      }),
      allowFailure: false,
    });
    const metadata = await client.multicall({
      contracts: newAddresses.map((vault) => {
        return {
          address: VaultRegistryByChain[chainId],
          abi: VaultRegistryAbi,
          functionName: "metadata",
          args: [vault],
        };
      }),
      allowFailure: false,
    });

    newAddresses.forEach((address, i) => {
      const creator = getAddress(metadata[i][2]);
      data[address] = {
        address: address,
        assetAddress: assets[i],
        chainId: chainId,
        type: "single-asset-vault-v1",
        description: "",
        creator: creator,
      };
    });
  }

  const adapterAndFees = await client.multicall({
    contracts: addresses
      .map((vault) => {
        return [
          {
            address: vault,
            abi: VaultAbi,
            functionName: "adapter",
          },
          {
            address: vault,
            abi: VaultAbi,
            functionName: "fees",
          },
          {
            address: vault,
            abi: VaultAbi,
            functionName: "feeRecipient",
          },
        ];
      })
      .flat(),
    allowFailure: false,
  });

  addresses.forEach((address, i) => {
    if (i > 0) i = i * 3;

    data[getAddress(address)].strategies = [getAddress(adapterAndFees[i])];
    data[getAddress(address)].fees = {
      deposit: Number(adapterAndFees[i + 1][0]),
      withdrawal: Number(adapterAndFees[i + 1][1]),
      management: Number(adapterAndFees[i + 1][2]),
      performance: Number(adapterAndFees[i + 1][3]),
    };
    data[getAddress(address)].feeRecipient = getAddress(adapterAndFees[i + 2]);
  });

  return data;
}

const chains = [1, 137, 10, 42161];

async function main() {
  for (let i = 0; i < chains.length; i++) {
    const data = await getStuffByChain(chains[i]);
    writeFileSync(
      `./archive/vaults/${chains[i]}.json`,
      JSON.stringify(data),
      "utf-8"
    );
  }
}

main();
