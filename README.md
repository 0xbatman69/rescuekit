# RescueKit

> **Website**: [rescuekit.app](https://rescuekit.app) &nbsp;|&nbsp; **Docs**: [rescuekit.app/docs](https://rescuekit.app/docs) &nbsp;|&nbsp; **X (Twitter)**: [x.com/rescuekit_/](https://x.com/rescuekit_/) (`@rescuekit_`) &nbsp;|&nbsp; **Telegram**: [t.me/rescuekit](https://t.me/rescuekit) (`@rescuekit`)

RescueKit helps you recover trapped funds from hacked or compromised EVM wallets. By using EIP-7702, a separate clean wallet pays the gas fees so automated sweeper bots never get a chance to steal your gas. You can rescue tokens, native coins, NFTs, staking rewards, vesting schedules, and claim distributions directly into a safe wallet in a single atomic transaction.

This repository contains the public source code for:
1. **RescueKit Companion** (`extension/`) — Lightweight browser extension to unlock third-party dApps for zero-gas wallets and extract transaction calldata.
2. **Smart Contracts** (`contracts/`) — Deployed `SponsorableBatchExecutor.sol` bytecode verified across 20 EVM mainnets.

---

## 1. RescueKit Companion (Browser Extension)

The companion browser extension extracts transaction calldata from third-party dApps when your compromised wallet has zero gas.

### 1.1 The Problem It Solves

When a compromised wallet is drained by sweeper bots, its native balance is zero. Most dApps (such as airdrop portals and NFT mints) check your wallet balance before enabling interaction buttons. When they detect 0 native coin, they lock the "Claim" or "Mint" button with "Insufficient balance for gas".

Because the button is disabled, you cannot initiate the interaction to generate the contract calldata required for recovery.

The extension solves this:
1. Simulates a local gas balance so the dApp enables the interaction button.
2. Intercepts the transaction payload locally in your browser before it reaches any mempool.
3. Captures the target contract address and hex calldata, then automatically redirects to the web app with the parameters pre-filled.

### 1.2 Key Notes

- Never asks for, stores, or handles private keys or seed phrases. The extension only accepts 40-character hex public addresses (`0x...`), strictly rejecting 64-character private keys, seed phrases, or invalid input.
- Runs 100% locally in your browser. No data is transmitted to external servers.
- Does not execute rescues or make transactions. It only extracts calldata for you to execute in the web app.
- Because the extension is strictly keyless, it cannot sign off-chain login messages (such as `personal_sign` or SIWE on platforms using Privy).

### 1.3 Extension Source Code

The companion extension source code is published directly in [`extension/`](extension/) for security verification and peer review:
- **`src/inpage/`**: Injected Web3 provider shim that overrides balance checks (`eth_getBalance`) to enable disabled dApp buttons.
- **`src/content/`**: Isolated bridge script passing requests between the page and extension background.
- **`src/background/`**: Service worker intercepting `eth_sendTransaction` to capture the target address and calldata, redirecting to the web app for recovery without ever touching private keys.
- **`src/popup/`**: Local UI for configuring your compromised public wallet address.

---

## 2. Smart Contracts & On-Chain Verification

Deployed Contract Address: `0x0000000008732229ED6Dca402A3C9EbbF31068E7` (Identical bytecode deployed across all 20 supported EVM mainnets).

The core execution contract is published in [`contracts/SponsorableBatchExecutor.sol`](contracts/SponsorableBatchExecutor.sol). It is deployed deterministically via CREATE2 at the exact same address across all 20 chains, enabling anyone to inspect the source code, verify compiler settings, and confirm on-chain integrity directly on any supported block explorer.

---

## 3. Smart Contract FAQ

### 3.1 Why does the contract address show no transaction history on block explorers?
This is entirely intentional. Transactions are sent directly to your compromised wallet address rather than to the contract itself. The contract code executes directly inside your account to transfer assets straight to your safe wallet, so your tokens never pass through a middleman contract. Because the contract address is never called as the destination of a transaction, block explorers show zero transaction history on it. Unlike tools that route everything through a shared contract where every rescue is publicly logged on a single page for anyone to monitor, your transaction history stays entirely on your own wallet.

### 3.2 If an MEV bot or frontrunner copies my signed transaction, can they steal the funds?
No, they cannot steal anything. If an attacker copies your transaction, changes the safe address to their own, and broadcasts it with higher gas, the signature immediately becomes invalid and the transaction reverts on-chain. If they broadcast the transaction without changing the safe address, they actually do you a favor by paying your gas bill while delivering your assets straight to your safe wallet. Furthermore, on Ethereum and BSC, rescues broadcast through private relays and never touch public mempools, so bots cannot even see them. On public mempools like Polygon or Berachain, the only thing a sweeper could try is burning gas to bump your account nonce and make the rescue revert, but they can never hijack your signature to steal your funds.

**Important:** While an attacker cannot hijack or modify your signed rescue transaction, if they already hold your compromised private key and have native gas to broadcast their own independent transfer, you are in an active race against them. Speed is critical. Always initiate and execute your rescue as quickly as possible.

### 3.3 What admin privileges does the contract owner have?
The owner can transfer contract ownership, update the `feeRecipient`, adjust `feeBps` (strictly hard-capped on-chain at 15%), set `affiliateCutBps`, configure `reserveAmount`, and toggle an emergency pause. The pause is a global circuit breaker that temporarily halts new batch executions across the protocol, and the owner cannot freeze or censor individual user wallets, nor modify any other contract parameters or logic. Deployments share identical bytecode and are verified across all 20 supported chains, so anyone is free to review the source code directly on block explorers.

### 3.4 What is the owner wallet address, and what happens if it gets compromised?
The owner address across all deployments is `0x7f201f66C6eE48d5A65E9067065d8953eEFD9909`. If this key were ever compromised, an attacker could pause new executions, increase `reserveAmount`, or redirect incoming protocol fees by updating the `feeRecipient`. However, user funds cannot be stolen because an attacker cannot bypass user signatures, cannot redirect rescued assets away from your safe destination, and cannot increase protocol fees beyond the 15% on-chain cap. Even if an attacker sets a higher reserve, those native assets simply remain untouched inside your own wallet rather than being transferred to the attacker.

### 3.5 Why doesn't the contract use EIP-712?
EIP-712 was designed specifically to format structured data for human review inside wallet extension popups (like MetaMask or Rabby). In RescueKit, signing happens directly in local client memory in milliseconds, so there is no interactive wallet prompt rendering typed data. Cryptographically, using `toEthSignedMessageHash` that binds `chainid`, `address(this)`, `mode`, `calls`, and `deadline` provides the exact same replay protection and execution security, without the contract bytecode bloat and extra gas cost of on-chain EIP-712 domain and typehash verification across 20 chains.

### 3.6 What is `reserveAmount`? Can the owner misuse it?
No. The contract sweeps `total = balance - reserve`, leaving the reserve untouched in your compromised wallet rather than sending it to the owner or your safe destination. It exists solely for Monad, which enforces a 10 MON minimum balance on delegated accounts. On every other supported chain, the reserve is 0.

### 3.7 Why does Mode 3 follow-up NFT rescue have no deadline?
Mode 3 is designed for NFT follow-up rescues. When an NFT's token ID cannot be predicted before minting, a follow-up transaction broadcasts as fast as possible after the receipt confirms to sweep the minted token, without requiring any manual interaction. The safe destination digest is signed automatically in memory upfront, strictly authorizing the contract to sweep NFTs to your pre-configured safe wallet. Mode 3 carries a 0% protocol fee, cannot deduct any 15% protocol fee, and cannot transfer ERC-20 tokens or native currency. Because on-chain execution is restricted strictly to transferring NFTs to that pre-authorized safe address, an expiration deadline is not required.

---

## 4. Fees & How They Work

### 4.1 Fee Breakdown by Asset
- Tokens (ERC-20) and native gas assets incur a 15% protocol recovery fee. The recovering user receives 85% net assets delivered to their safe destination wallet.
- NFTs (ERC-721 and ERC-1155) have a 0% protocol fee. Rescued NFTs are delivered 100% intact to your safe destination wallet with no fee deduction.
- Fees are collected in kind directly in the recovered asset with no external price feeds or oracles. For example, recovering 1,000 USDC delivers 850 USDC to your safe wallet and 150 USDC to the protocol.
- Gas fees are separate from protocol fees and are paid by your sponsor wallet in native network currency directly to blockchain validators.

### 4.2 Referral Split
- When a rescue is executed through a referral link, the 15% fee is split on-chain, where 6% goes to the referrer and 9% goes to the protocol treasury. The recovering user receives their full 85% net assets.
- If no referral link is used, or if anti-self-referral checks are triggered, the entire 15% fee goes to the protocol treasury.
- If the referrer payout address cannot receive funds (for example, a contract that rejects the transfer), the 6% cut redirects to the protocol treasury.
- If redirecting that 6% cut to the treasury also fails, the contract automatically adds the unpayable 6% back to the user's sweep amount, delivering 91% net recovery to the safe destination rather than leaving those tokens behind in the compromised wallet.

### 4.3 Transfer Order & Safe Destination Requirements
- Protocol fees are collected on-chain before the remaining balance is dispatched to your safe destination wallet. This fee-first order prevents malicious contracts from engineering revert traps on the protocol treasury to rescue assets for free.
- Always use a clean standard EOA wallet address or a verified Gnosis Safe as your safe destination. If a safe destination cannot receive transfers (such as a contract without a receive function for native currency, or an address blacklisted by centralized tokens like USDC or USDT), that transfer fails on-chain (`CallFailed`) while the fee remains collected.
- When a destination transfer fails, the remaining 85% stays behind in the compromised wallet where it remains vulnerable to sweeper bots. In that scenario, you will need to execute a new rescue with a clean, working safe wallet to recover the remaining funds, resulting in the 15% fee being charged once again on that remaining balance.
- To prevent this risk, the app verifies your safe destination address before execution:
  - **Standard EOA Wallets**: Recommended. Standard private key wallets have no custom code and cannot reject incoming transfers.
  - **Gnosis Safe**: Supported if your Safe is already deployed on the rescue network and accepts native coin. If your Safe is not deployed on the target chain, the rescue is blocked to protect your funds. You must deploy your Safe on that network first or use a standard EOA wallet instead.
  - **Other Contracts Blocked**: Custom smart contracts, smart accounts, and unverified addresses are blocked to prevent your funds from getting trapped.
- If the entire transaction reverts on-chain, all state changes roll back completely via standard EVM execution and zero protocol fees are charged.

---

## 5. Supported Networks

RescueKit is deployed across 20 EVM mainnets. All deployments share the identical contract address `0x0000000008732229ED6Dca402A3C9EbbF31068E7`.

| Network | ID | Explorer Contract Link |
|---|---|---|
| Ethereum | 1 | https://etherscan.io/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| Base | 8453 | https://basescan.org/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| BNB Chain | 56 | https://bscscan.com/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| Arbitrum One | 42161 | https://arbiscan.io/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| Arc | 5042 | https://arc.etherscan.io/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| Polygon | 137 | https://polygonscan.com/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| Optimism | 10 | https://optimistic.etherscan.io/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| Monad | 143 | https://monadscan.com/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| Sonic | 146 | https://sonicscan.org/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| Robinhood | 4663 | https://robin.etherscan.io/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| Berachain | 80094 | https://berascan.com/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| MegaETH | 4326 | https://mega.etherscan.io/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| Linea | 59144 | https://lineascan.build/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| Ink | 57073 | https://explorer.inkonchain.com/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| Unichain | 130 | https://uniscan.xyz/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| Sei | 1329 | https://seiscan.io/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| World Chain | 480 | https://worldscan.org/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| Somnia | 5031 | https://explorer.somnia.network/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| Plasma | 9745 | https://plasmascan.to/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |
| Plume | 98866 | https://explorer.plume.org/address/0x0000000008732229ED6Dca402A3C9EbbF31068E7 |

> **Note:** Contract bytecode is 100% identical across all 20 chains via CREATE2. Ink, Somnia, and Plume are unverified for now because their explorers don't support Solidity 0.8.37 yet.

---

## 6. What RescueKit Can & Cannot Do

### 6.1 What RescueKit Can Do
- Rescue without funding your compromised wallet with gas (your sponsor wallet pays the gas).
- Rescue single or multiple tokens, native coins, and NFTs on any chain in a single transaction, or execute across multiple chains at the same time.
- Mint new NFTs and sweep existing NFTs to your safe wallet in a single transaction.
- Rescue single or multiple claims on any chain in a single transaction, or execute across multiple chains at the same time.

### 6.2 What RescueKit Cannot Do
- Recover funds that were already stolen or transferred out before your rescue.
- Recover funds if you enter an attacker-controlled or compromised safe destination address.
- Rescue non-transferable or soulbound tokens and NFTs that cannot be moved on-chain.
- Protect your sponsor wallet if you leak or compromise the sponsor wallet's own private key or seed phrase.
- Guarantee newly minted NFTs are swept in the same transaction if the NFT contract does not support standard discovery methods.
- Access, store, or recover your private keys or seed phrases (RescueKit is strictly non-custodial and operates 100% client-side in your local browser).
- Refund protocol recovery fees or network validator gas once transactions confirm on-chain (on-chain execution is final and non-refundable).
- Reverse transactions once confirmed on the blockchain.
- Authorize or permit recovery operations on accounts you do not own or lack legal authorization to recover (use is strictly restricted to wallets you legally own or control).
- Provide financial warranties or assume liability for lost assets, blockchain reorganizations, network latency, or user input errors (software provided "as is").

---

## 7. Security & Vulnerability Reporting

If you discover a security vulnerability or edge-case behavior within the smart contracts or companion extension, please report it responsibly:

- **Telegram**: [t.me/rescuekit](https://t.me/rescuekit) (`@rescuekit`)
- **X (Twitter)**: [x.com/rescuekit_/](https://x.com/rescuekit_/) (`@rescuekit_`)

