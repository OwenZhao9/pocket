const position = [
  { name: "owner", type: "address" },
  { name: "isLong", type: "bool" },
  { name: "open", type: "bool" },
  { name: "openedAt", type: "uint64" },
  { name: "margin", type: "uint128" },
  { name: "entryPrice", type: "uint128" },
  { name: "takeProfit", type: "uint128" },
  { name: "stopLoss", type: "uint128" },
  { name: "exitPrice", type: "uint128" },
  { name: "payout", type: "uint128" },
  { name: "closedAt", type: "uint64" },
  { name: "closedByTrigger", type: "bool" },
] as const;

export const marketAbi = [
  { type: "function", name: "positions", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: position },
  { type: "function", name: "positionsOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256[]" }] },
  {
    type: "function",
    name: "quote",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "payout", type: "uint256" },
      { name: "price", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "openWithPermit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "isLong", type: "bool" },
      { name: "margin", type: "uint256" },
      { name: "takeProfit", type: "uint256" },
      { name: "stopLoss", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  { type: "function", name: "close", stateMutability: "nonpayable", inputs: [{ name: "id", type: "uint256" }], outputs: [] },
  {
    type: "function",
    name: "setTriggers",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "takeProfit", type: "uint256" },
      { name: "stopLoss", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const priceSourceAbi = [
  {
    type: "function",
    name: "latest",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "price", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
    ],
  },
] as const;

export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
