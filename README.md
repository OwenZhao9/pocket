# Pocket

**口袋里的交易台。刷脸登录,选涨或跌,确认。没有助记词,没有杠杆,没有订单簿。想走开的时候设一条规则,服务器替你盯盘。**

- 在线试用:**https://pocket.photogif.workers.dev**(手机或电脑浏览器,点「刷脸创建账户」即可)
- 网络:Avalanche Fuji 测试网(C-Chain 43113)+ Pocket 自己的 L1(431143)
- 方向:消费应用与支付

| 登录 | 交易 | 持仓与规则 | x402 行情 | 加密日记 |
|---|---|---|---|---|
| ![](docs/screenshots/1-welcome.png) | ![](docs/screenshots/2-trade.png) | ![](docs/screenshots/3-positions.png) | ![](docs/screenshots/4-insight.png) | ![](docs/screenshots/5-journal.png) |

在电脑上打开是「评委视图」:左边是装在手机外框里的应用,右边是每项 Avalanche 能力的链上证据。

![](docs/screenshots/judge-view.png)

---

## 评委怎么试(一分钟)

1. 打开上面的链接,点 **「刷脸创建账户」**。浏览器会用通行密钥(Face ID / Touch ID / 系统密码)创建账户——没有助记词,也不用装钱包插件
2. 几秒后自动到账 **100 pUSD 交易资金 + 手续费 + 0.05 USDC**,不用自己去领水
3. 选 **看涨 / 看跌**,选金额,确认。一笔交易上链,底部提示里能点开 Snowtrace 看记录
4. 「持仓」页能看到实时盈亏,以及服务器上的规则引擎上一次什么时候检查过
5. 「行情」页付 **0.01 USDC** 看一份两小时行情解读——这是 x402 按次付费,付款就是一次签名
6. 「日记」页的内容是加密存在本机的,点「看看存的是什么」能看到实际存储的密文

锁定后再次刷脸,会回到**同一个地址**——账户是从通行密钥确定性派生出来的。

如果你的浏览器或设备上的通行密钥不支持 PRF 扩展(派生密钥要用到它),或者你不想在钥匙串里留一个通行密钥,出错提示下面有「用演示账户继续」:随机生成一个只保存在这个浏览器里的账户,其余功能完全一样。

---

## 为什么做这个

Avalanche 上的交易应用(LFJ、GMX、BENQI)全是网页,唯一的 iOS 应用是官方的 Core 钱包,而那是钱包不是交易应用。已经在链上的人想在手机上交易,能用的只有「在手机浏览器里开一个桌面网页」。

Pocket 是一个**原生 iOS 应用**,同一套代码也导出了网页版给评委验证。

---

## 本次黑客松完成的部分

**全部代码都是本次黑客松期间从零写的**,没有沿用任何既有项目。提交历史可以逐条核对。

| 部分 | 做了什么 |
|---|---|
| 合约 | 涨跌仓位市场、链上止盈止损、一次性领水、ICM 成交回执(发布者 + 回执簿),共 28 条测试,含 512 轮偿付能力模糊测试 |
| 服务端 | 一个 Cloudflare Worker:领水接口、每分钟一次的规则引擎、x402 付费接口(自建结算方)、iOS 关联域名文件、托管网页版 |
| 应用 | Expo(React Native),iOS 原生 + 网页版共用一套代码。通行密钥账户、交易、持仓、规则、x402 付费、加密日记 |
| L1 | Pocket L1(链 ID 431143):主权 L1,Subnet-EVM,PoA 验证人管理合约已初始化,Teleporter 已部署 |
| ICM | C-Chain 上的回执发布者 + L1 上的回执簿 + 自建中继器,第一条跨链回执已送达 |

---

## 用到的 Avalanche 能力

| 能力 | 在 Pocket 里做什么 |
|---|---|
| **C-Chain 合约** | 市场、领水、回执发布者都部署在 Fuji C-Chain,源码已在 Snowtrace 验证 |
| **性能** | 服务器发一笔交易,从签名到链上确认实测 2.2–2.6 秒。应用里下一单只需两次网络往返:交易在设备本地签名,gas 上限和手续费上限预先定好,省掉估算的往返。一笔交易的 gas 费远低于一分钱,新手资金里送的那点 AVAX 够下几百单 |
| **L1** | Pocket 自己的 L1,用来存每个用户的成交回执——一份可携带、可验证的交易战绩 |
| **ICM** | 每笔平仓后,C-Chain 上的发布者从市场合约里**读取**真实结果,通过 Teleporter 发到 L1 上记账。回执内容不来自调用者,伪造不了 |
| **x402** | 「两小时行情解读」按次付费,0.01 USDC。服务器自己验签、自己提交 USDC 转账,不依赖第三方结算方 |

---

## 架构

```
 iPhone / 浏览器
   │  通行密钥(WebAuthn PRF)── 一次刷脸 ──▶ HKDF 派生
   │                                          ├─ 交易私钥(secp256k1,只在内存里)
   │                                          └─ 日记密钥(AES-256-GCM)
   │
   ├──▶ C-Chain  PocketMarket   开仓(EIP-2612 permit,一笔交易)/ 平仓 / 设规则
   │             PocketFaucet   新账户一次性领取启动资金
   │
   └──▶ Cloudflare Worker  pocket.photogif.workers.dev
          ├ /api/drip       调领水合约
          ├ /api/insight    x402 付费(0.01 USDC)
          ├ cron 每分钟     规则引擎:合约确认价格到位才能触发
          │                 回执发布:已平仓 → ReceiptPublisher ──ICM──▶ Pocket L1 ReceiptBook
          └ 静态资源         网页版
```

价格来自 **Chainlink AVAX/USD(Fuji)**,实测约每 10 分钟更新一次。

---

## 安全设计

- **部署钥匙从不上服务器。** 合约所有权和资金池都在部署钥匙手里,它只存在开发者本机。服务器只拿「执行器」钥匙
- **执行器碰不到用户的钱。** 止盈止损写在合约里,执行器只能在合约用喂价确认条件成立时触发,而且钱永远打回仓位主人
- **领水有上限。** 每个地址只能领一次,由合约记账;就算服务器被攻破,损失上限是领水合约里的余额
- **资金池永远偿付得起。** 每开一个仓位,池子按保证金的 2 倍预留;模糊测试验证了任何价格下都能全额兑付
- **私钥不落盘。** 交易私钥每次刷脸时从通行密钥重新派生,只在内存里;锁定时清零

---

## 合约(Fuji C-Chain,均已在 Snowtrace 验证源码)

| 合约 | 地址 |
|---|---|
| PocketMarket | [`0x81d00d6A3b9bdCE2e5C70dd2C7f11E4E30631012`](https://testnet.snowtrace.io/address/0x81d00d6A3b9bdCE2e5C70dd2C7f11E4E30631012) |
| PocketUSD (pUSD) | [`0x176bF1378f945035fe64Ed3efc44d3Ad737F415a`](https://testnet.snowtrace.io/address/0x176bF1378f945035fe64Ed3efc44d3Ad737F415a) |
| ChainlinkPriceSource | [`0xd018ED0cd4b961562346bb5814FDa0A7ef9eA8B8`](https://testnet.snowtrace.io/address/0xd018ED0cd4b961562346bb5814FDa0A7ef9eA8B8) |
| PocketFaucet | [`0xef0CB3769F111c3Ca9D17CE8499EE7451E6DE2e1`](https://testnet.snowtrace.io/address/0xef0CB3769F111c3Ca9D17CE8499EE7451E6DE2e1) |

| ReceiptPublisher(ICM 发送方) | [`0x69D5BD3f8B53f6C6c7679AF9703a015b4Db5F2f7`](https://testnet.snowtrace.io/address/0x69D5BD3f8B53f6C6c7679AF9703a015b4Db5F2f7) |
| TeleporterMessenger(官方) | [`0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf`](https://testnet.snowtrace.io/address/0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf) |

所有地址集中在 [`config/fuji.json`](config/fuji.json),合约、服务端、应用共用这一个文件。

### Pocket L1

| 项 | 值 |
|---|---|
| 链 ID | 431143(代币 PKT) |
| Subnet ID | `sqZfDfuLVQJLegqCceBny5eXChRASJxA5d4d3sfJ5MoqxSMUT` |
| Blockchain ID | `oakJiv5A35aNYD2MRcN8qYUwB3hTya8sohR8BTgUduDb6NKiK` |
| 转换为 L1 的 P-Chain 交易 | `2u8T3XUUvqXXkuiDyitsEzJfnfpsJPMiFwV78qHFZjypJ1QBAn` |
| 验证人管理 | Proof of Authority,已初始化 |
| TeleporterMessenger | `0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf`(与 C-Chain 同址,官方确定性部署) |
| ReceiptBook | `0xa34AA4Fe1f6811b478719C64c67F1b7ef08817D2` |

L1 的信息在 [`config/pocket-l1.json`](config/pocket-l1.json)。

### 链上证据

| 事件 | 交易 |
|---|---|
| 第一笔开仓 | [`0xdbffd593…bb915`](https://testnet.snowtrace.io/tx/0xdbffd593ee93eec60f851adc82974b18b939e30083396092b2d6a8ba602bb915) |
| 第一次领水 | [`0xc83e4fd1…18e64`](https://testnet.snowtrace.io/tx/0xc83e4fd12383731814c1164e45cf2a1b4e082330dc3bf42d6ab1a1cdf3918e64) |
| 第一次 x402 结算 | [`0x58952c2b…f2223`](https://testnet.snowtrace.io/tx/0x58952c2b83c51c60a923f61161f743d2a8441e489ad92342f931ac0e531f2223) |
| ICM 回执:C-Chain 发出 | [`0x784c3061…0cd11`](https://testnet.snowtrace.io/tx/0x784c3061fb86592167144fffefe290089d1e252ccf0c26e507e1687bc050cd11)(Teleporter 消息 `2eZuN5dxCmu93yGV6cUbMjgMj3ZbNhhsBR66xLA4rF2LyY4JVf`) |
| ICM 回执:L1 上记账 | L1 第 12 块,交易 `0x210eb78e4516b1e7490de744be670cc777003c799d3dc9b122e0121d9a4121c0`,`ReceiptBook.count() = 1` |

---

## 已知限制(老实说)

- **只在测试网。** pUSD 是测试币,没有价值。这是黑客松版本,不是生产级产品
- **演示账户的钥匙存在浏览器的本地存储里。** 它只是给不支持通行密钥 PRF 的浏览器兜底试用,不提供通行密钥那样的保护
- **价格每 10 分钟才更新一次。** Chainlink 在 Fuji 上的 AVAX/USD 按偏离阈值推送,实测间隔约 10 分钟。在价格还没更新的窗口里开仓,理论上可以利用已知的价差——生产版需要换成按需更新的预言机(合约里价格源是接口,可以直接换)
- **L1 的验证节点和 ICM 中继器跑在开发者本机。** 本机休眠时 L1 出块会停,回执留在 C-Chain 上排队,恢复后由中继器补投(`ops/l1-up.sh`)。L1 的 RPC 不对公网开放,所以应用里只显示 C-Chain 一侧「回执已发出」的状态。现场演示的主线不依赖 L1
- **不上架 App Store。** 苹果规则 3.1.5(b) 要求加密货币交易类应用来自持牌金融机构。iOS 版通过 TestFlight 内部测试分发,评委用网页版验证

---

## 本地运行

```bash
# 合约
cd contracts && forge test

# 服务端(需要 Cloudflare 账号)
cd server && npm install && npx wrangler dev

# 应用
cd app && npm install
npx expo start --web          # 网页
npx expo run:ios              # iOS(需要 iOS 18+,通行密钥需要关联域名)
```

部署用的环境变量见 [`.env.example`](.env.example)。

### 两个环境上的坑

- **原生 iOS 构建要在不含空格的路径下做。** Expo 的 `expo-constants` 有一个构建脚本用 `bash -c "$PODS_TARGET_SRCROOT/..."`,路径里有空格就会断
- **Avalanche CLI 1.9.6 自带的组件对现在的 Fuji 太旧。** 它默认装 avalanchego 1.14、subnet-evm 0.8.0(RPCChainVM 44)和签名聚合器 0.5.3,而 Fuji 已经是 1.15(协议 46)。L1 用的是 avalanchego 1.15.1、它发布包里的 subnet-evm 1.15.1,签名聚合器 0.6.0 和中继器 1.8.2 是从 `ava-labs/icm-services` 官方源码编译的(这两个版本没有发 macOS 版)

### 让 L1 恢复运行

```bash
./ops/l1-up.sh
```

启动本机验证节点和 C-Chain → L1 的中继器。中继器配置由 [`ops/relayer-config.py`](ops/relayer-config.py) 从 `.env` 现场生成,存在仓库外面。
