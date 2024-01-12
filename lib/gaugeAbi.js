import { parseAbi } from "viem";

export const GaugeAbi = parseAbi([
    "function decimals() view returns (uint256)",
    "function is_killed() view returns (bool)",
    "function lp_token() view returns (address)",
    "function inflation_rate() view returns (uint256)",
    "function getCappedRelativeWeight(uint256) view returns (uint256)",
    "function tokenless_production() view returns (uint256)",
    "function working_supply() view returns (uint256)",
]);