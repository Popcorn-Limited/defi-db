import { parseAbi } from "viem";

export const GaugeControllerAbi = parseAbi([
    "function n_gauges() view returns (uint256)",
    "function gauges(uint256) view returns (address)",
]);