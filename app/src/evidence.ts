import { addresses, EXPLORER } from "./config";

/// Public, independently checkable proof for each Avalanche capability the app uses.
export const evidence = [
  {
    title: "C-Chain 合约",
    body: "市场、测试美元、领水、ICM 发布者都部署在 Fuji,源码已在 Snowtrace 验证。",
    link: `${EXPLORER}/address/${addresses.market}#code`,
    linkText: "看市场合约源码",
  },
  {
    title: "性能",
    body: "服务器发一笔交易,从签名到链上确认实测 2.2–2.6 秒。应用里下一单只需两次网络往返,签名在设备本地完成。",
    link: `${EXPLORER}/tx/0xe512029daeb107141257637df61150965a0fa2baead30e527d3fa686f4ffbb7f`,
    linkText: "看一笔开仓(permit 和开仓在同一笔交易里)",
  },
  {
    title: "Pocket L1",
    body: "自己的主权 L1(链 ID 431143),PoA 验证人管理,部署了 Teleporter。",
    link: "https://build.avax.network/explorer/fuji/p-chain/tx/2u8T3XUUvqXXkuiDyitsEzJfnfpsJPMiFwV78qHFZjypJ1QBAn",
    linkText: "看「转为 L1」的 P-Chain 交易",
  },
  {
    title: "ICM",
    body: "每笔平仓后,服务器调用 C-Chain 上的发布者,它从市场合约读出真实结果,经 Teleporter 写进 L1 的回执簿。",
    link: `${EXPLORER}/tx/0xe63f9b8825a2274f7bcf301bf70253f0246ebee2e0e5603d0862ff7b21a27c13`,
    linkText: "看一条自动发出的回执",
  },
  {
    title: "x402",
    body: "「行情」页按次付费 0.01 USDC。服务器自己验签、自己提交 USDC 转账,不经过第三方。",
    link: `${EXPLORER}/tx/0x58952c2b83c51c60a923f61161f743d2a8441e489ad92342f931ac0e531f2223`,
    linkText: "看一次付款结算",
  },
];

export const REPO_URL = "https://github.com/OwenZhao9/pocket";
