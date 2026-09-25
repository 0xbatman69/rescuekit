/**
 * @file inject.ts
 * Inpage EIP-1193 & EIP-6963 Provider.
 * Injected at document_start in world: "MAIN".
 * Features:
 *  1. Multi-wallet impersonation (RescueKit, MetaMask, Coinbase, Phantom, OKX, Trust) with distinct EIP-6963 provider instances
 *  2. Instant connection for eth_requestAccounts / eth_accounts (zero lag, zero freezes)
 *  3. Full balance spoofing (2.5 ETH / 100 POL / 5 BNB / 100 MON)
 *  4. Multicall3 getEthBalance spoofing + window.fetch JSON-RPC interceptor
 *  5. Safe gas estimation spoofing
 *  6. Transaction interception -> redirects claim/mint calldata to RescueKit Web UI
 */
(() => {
  const win = window as any;
  if (win.__rescuekitInjected) return;
  win.__rescuekitInjected = true;

  const RESCUEKIT_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjU0IDEyNTQiPgogIDxyZWN0IHdpZHRoPSIxMjU0IiBoZWlnaHQ9IjEyNTQiIHJ4PSIyODAiIHJ5PSIyODAiIGZpbGw9IiNFNTU0M0QiIC8+CiAgPHBhdGggZD0iTTM3MiAzMTVoNDk1bDEyMCAyMDAtODEgMTUwaC0xMzhsODMtMTUwLTQ3LTgxSDMwM3pNNDIxIDU1MGgyODBsNjcgMTE1IDEzOCAyMzNINzcxTDYzNCA2NjVIMzU0ek00MjYgNzgyaDEzNGwtNjcgMTE2SDM1OXoiIGZpbGw9IiNGRkZGRkYiIC8+Cjwvc3ZnPg==';

  const METAMASK_ICON = 'data:image/svg+xml;base64,PHN2ZyBmaWxsPSJub25lIiBoZWlnaHQ9IjMzIiB2aWV3Qm94PSIwIDAgMzUgMzMiIHdpZHRoPSIzNSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iLjI1Ij48cGF0aCBkPSJtMzIuOTU4MiAxLTEzLjEzNDEgOS43MTgzIDIuNDQyNC01LjcyNzMxeiIgZmlsbD0iI2UxNzcyNiIgc3Ryb2tlPSIjZTE3NzI2Ii8+PGcgZmlsbD0iI2UyNzYyNSIgc3Ryb2tlPSIjZTI3NjI1Ij48cGF0aCBkPSJtMi42NjI5NiAxIDEzLjAxNzE0IDkuODA5LTIuMzI1NC01LjgxODAyeiIvPjxwYXRoIGQ9Im0yOC4yMjk1IDIzLjUzMzUtMy40OTQ3IDUuMzM4NiA3LjQ4MjkgMi4wNjAzIDIuMTQzNi03LjI4MjN6Ii8+PHBhdGggZD0ibTEuMjcyODEgMjMuNjUwMSAyLjEzMDU1IDcuMjgyMyA3LjQ2OTk0LTIuMDYwMy0zLjQ4MTY2LTUuMzM4NnoiLz48cGF0aCBkPSJtMTAuNDcwNiAxNC41MTQ5LTIuMDc4NiAzLjEzNTggNy40MDUuMzM2OS0uMjQ2OS03Ljk2OXoiLz48cGF0aCBkPSJtMjUuMTUwNSAxNC41MTQ5LTUuMTU3NS00LjU4NzA0LS4xNjg4IDguMDU5NzQgNy40MDQ5LS4zMzY5eiIvPjxwYXRoIGQ9Im0xMC44NzMzIDI4Ljg3MjEgNC40ODE5LTIuMTYzOS0zLjg1ODMtMy4wMDYyeiIvPjxwYXRoIGQ9Im0yMC4yNjU5IDI2LjcwODIgNC40Njg5IDIuMTYzOS0uNjEwNS01LjE3MDF6Ii8+PC9nPjxwYXRoIGQ9Im0yNC43MzQ4IDI4Ljg3MjEtNC40NjktMi4xNjM5LjM2MzggMi45MDI1LS4wMzkgMS4yMzF6IiBmaWxsPSIjZDViZmIyIiBzdHJva2U9IiNkNWJmYjIiLz48cGF0aCBkPSJtMTAuODczMiAyOC44NzIxIDQuMTU3MiAxLjk2OTYtLjAyNi0xLjIzMS4zNTA4LTIuOTAyNXoiIGZpbGw9IiNkNWJmYjIiIHN0cm9rZT0iI2Q1YmZiMiIvPjxwYXRoIGQ9Im0xNS4xMDg0IDIxLjc4NDItMy43MTU1LTEuMDg4NCAyLjYyNDMtMS4yMDUxeiIgZmlsbD0iIzIzMzQ0NyIgc3Ryb2tlPSIjMjMzNDQ3Ii8+PHBhdGggZD0ibTIwLjUxMjYgMjEuNzg0MiAxLjA5MTMtMi4yOTM1IDIuNjM3MiAxLjIwNTF6IiBmaWxsPSIjMjMzNDQ3IiBzdHJva2U9IiMyMzM0NDciLz48cGF0aCBkPSJtMTAuODczMyAyOC44NzIxLjY0OTUtNS4zMzg2LTQuMTMxMTcuMTE2N3oiIGZpbGw9IiNjYzYyMjgiIHN0cm9rZT0iI2NjNjIyOCIvPjxwYXRoIGQ9Im0yNC4wOTgyIDIzLjUzMzUuNjM2NiA1LjMzODYgMy40OTQ2LTUuMjIxOXoiIGZpbGw9IiNjYzYyMjgiIHN0cm9rZT0iI2NjNjIyOCIvPjxwYXRoIGQ9Im0yNy4yMjkxIDE3LjY1MDctNy40MDUuMzM2OS42ODg1IDMuNzk2NiAxLjA5MTMtMi4yOTM1IDIuNjM3MiAxLjIwNTF6IiBmaWxsPSIjY2M2MjI4IiBzdHJva2U9IiNjYzYyMjgiLz48cGF0aCBkPSJtMTEuMzkyOSAyMC42OTU4IDIuNjI0Mi0xLjIwNTEgMS4wOTEzIDIuMjkzNS42ODg1LTMuNzk2Ni03LjQwNDk1LS4zMzY5eiIgZmlsbD0iI2NjNjIyOCIgc3Ryb2tlPSIjY2M2MjI4Ii8+PHBhdGggZD0ibTguMzkyIDE3LjY1MDcgMy4xMDQ5IDYuMDUxMy0uMTAzOS0zLjAwNjJ6IiBmaWxsPSIjZTI3NTI1IiBzdHJva2U9IiNlMjc1MjUiLz48cGF0aCBkPSJtMjQuMjQxMiAyMC42OTU4LS4xMTY5IDMuMDA2MiAzLjEwNDktNi4wNTEzeiIgZmlsbD0iI2UyNzUyNSIgc3Ryb2tlPSIjZTI3NTI1Ii8+PHBhdGggZD0ibTE1Ljc5NyAxNy45ODc2LS42ODg2IDMuNzk2Ny44NzA0IDQuNDgzMy4xOTQ5LTUuOTA4N3oiIGZpbGw9IiNlMjc1MjUiIHN0cm9rZT0iI2UyNzUyNSIvPjxwYXRoIGQ9Im0xOS44MjQyIDE3Ljk4NzYtLjM2MzggMi4zNTg0LjE4MTkgNS45MjE2Ljg3MDQtNC40ODMzeiIgZmlsbD0iI2UyNzUyNSIgc3Ryb2tlPSIjZTI3NTI1Ii8+PHBhdGggZD0ibTIwLjUxMjcgMjEuNzg0Mi0uODcwNCA0LjQ4MzQuNjIzNi40NDA2IDMuODU4NC0zLjAwNjIuMTE2OS0zLjAwNjJ6IiBmaWxsPSIjZjU4NDFmIiBzdHJva2U9IiNmNTg0MWYiLz48cGF0aCBkPSJtMTEuMzkyOSAyMC42OTU4LjEwNCAzLjAwNjIgMy44NTgzIDMuMDA2Mi42MjM2LS40NDA2LS44NzA0LTQuNDgzNHoiIGZpbGw9IiNmNTg0MWYiIHN0cm9rZT0iI2Y1ODQxZiIvPjxwYXRoIGQ9Im0yMC41OTA2IDMwLjg0MTcuMDM5LTEuMjMxLS4zMzc4LS4yODUxaC00Ljk2MjZsLS4zMjQ4LjI4NTEuMDI2IDEuMjMxLTQuMTU3Mi0xLjk2OTYgMS40NTUxIDEuMTkyMSAyLjk0ODkgMi4wMzQ0aDUuMDUzNmwyLjk2Mi0yLjAzNDQgMS40NDItMS4xOTIxeiIgZmlsbD0iI2MwYWM5ZCIgc3Ryb2tlPSIjYzBhYzlkIi8+PHBhdGggZD0ibTIwLjI2NTkgMjYuNzA4Mi0uNjIzNi0uNDQwNmgtMy42NjM1bC0uNjIzNi40NDA2LS4zNTA4IDIuOTAyNS4zMjQ4LS4yODUxaDQuOTYyNmwuMzM3OC4yODUxeiIgZmlsbD0iIzE2MTYxNiIgc3Ryb2tlPSIjMTYxNjE2Ii8+PHBhdGggZD0ibTMzLjUxNjggMTEuMzUzMiAxLjEwNDMtNS4zNjQ0Ny0xLjY2MjktNC45ODg3My0xMi42OTIzIDkuMzk0NCA0Ljg4NDYgNC4xMjA1IDYuODk4MyAyLjAwODUgMS41Mi0xLjc3NTItLjY2MjYtLjQ3OTUgMS4wNTIzLS45NTg4LS44MDU0LS42MjIgMS4wNTIzLS44MDM0eiIgZmlsbD0iIzc2M2UxYSIgc3Ryb2tlPSIjNzYzZTFhIi8+PHBhdGggZD0ibTEgNS45ODg3MyAxLjExNzI0IDUuMzY0NDctLjcxNDUxLjUzMTMgMS4wNjUyNy44MDM0LS44MDU0NS42MjIgMS4wNTIyOC45NTg4LS42NjI1NS40Nzk1IDEuNTE5OTcgMS43NzUyIDYuODk4MzUtMi4wMDg1IDQuODg0Ni00LjEyMDUtMTIuNjkyMzMtOS4zOTQ0eiIgZmlsbD0iIzc2M2UxYSIgc3Ryb2tlPSIjNzYzZTFhIi8+PHBhdGggZD0ibTMyLjA0ODkgMTYuNTIzNC02Ljg5ODMtMi4wMDg1IDIuMDc4NiAzLjEzNTgtMy4xMDQ5IDYuMDUxMyA0LjEwNTItLjA1MTloNi4xMzE4eiIgZmlsbD0iI2Y1ODQxZiIgc3Ryb2tlPSIjZjU4NDFmIi8+PHBhdGggZD0ibTEwLjQ3MDUgMTQuNTE0OS02Ljg5ODI4IDIuMDA4NS0yLjI5OTQ0IDcuMTI2N2g2LjExODgzbDQuMTA1MTkuMDUxOS0zLjEwNDg3LTYuMDUxM3oiIGZpbGw9IiNmNTg0MWYiIHN0cm9rZT0iI2Y1ODQxZiIvPjxwYXRoIGQ9Im0xOS44MjQxIDE3Ljk4NzYuNDQxNy03LjU5MzIgMi4wMDA3LTUuNDAzNGgtOC45MTE5bDIuMDAwNiA1LjQwMzQuNDQxNyA3LjU5MzIuMTY4OSAyLjM4NDIuMDEzIDUuODk1OGgzLjY2MzVsLjAxMy01Ljg5NTh6IiBmaWxsPSIjZjU4NDFmIiBzdHJva2U9IiNmNTg0MWYiLz48L2c+PC9zdmc+';

  const COINBASE_ICON = 'data:image/svg+xml,<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">%0A<rect width="28" height="28" fill="%232C5FF6"/>%0A<path fill-rule="evenodd" clip-rule="evenodd" d="M14 23.8C19.4124 23.8 23.8 19.4124 23.8 14C23.8 8.58761 19.4124 4.2 14 4.2C8.58761 4.2 4.2 8.58761 4.2 14C4.2 19.4124 8.58761 23.8 14 23.8ZM11.55 10.8C11.1358 10.8 10.8 11.1358 10.8 11.55V16.45C10.8 16.8642 11.1358 17.2 11.55 17.2H16.45C16.8642 17.2 17.2 16.8642 17.2 16.45V11.55C17.2 11.1358 16.8642 10.8 16.45 10.8H11.55Z" fill="white"/>%0A</svg>%0A';

  const PHANTOM_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDgiIGhlaWdodD0iMTA4IiB2aWV3Qm94PSIwIDAgMTA4IDEwOCIgZmlsbD0ibm9uZSI+CjxyZWN0IHdpZHRoPSIxMDgiIGhlaWdodD0iMTA4IiByeD0iMjYiIGZpbGw9IiNBQjlGRjIiLz4KPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik00Ni41MjY3IDY5LjkyMjlDNDIuMDA1NCA3Ni44NTA5IDM0LjQyOTIgODUuNjE4MiAyNC4zNDggODUuNjE4MkMxOS41ODI0IDg1LjYxODIgMTUgODMuNjU2MyAxNSA3NS4xMzQyQzE1IDUzLjQzMDUgNDQuNjMyNiAxOS44MzI3IDcyLjEyNjggMTkuODMyN0M4Ny43NjggMTkuODMyNyA5NCAzMC42ODQ2IDk0IDQzLjAwNzlDOTQgNTguODI1OCA4My43MzU1IDc2LjkxMjIgNzMuNTMyMSA3Ni45MTIyQzcwLjI5MzkgNzYuOTEyMiA2OC43MDUzIDc1LjEzNDIgNjguNzA1MyA3Mi4zMTRDNjguNzA1MyA3MS41NzgzIDY4LjgyNzUgNzAuNzgxMiA2OS4wNzE5IDY5LjkyMjlDNjUuNTg5MyA3NS44Njk5IDU4Ljg2ODUgODEuMzg3OCA1Mi41NzU0IDgxLjM4NzhDNDcuOTkzIDgxLjM4NzggNDUuNjcxMyA3OC41MDYzIDQ1LjY3MTMgNzQuNDU5OEM0NS42NzEzIDcyLjk4ODQgNDUuOTc2OCA3MS40NTU2IDQ2LjUyNjcgNjkuOTIyOVpNODMuNjc2MSA0Mi41Nzk0QzgzLjY3NjEgNDYuMTcwNCA4MS41NTc1IDQ3Ljk2NTggNzkuMTg3NSA0Ny45NjU4Qzc2Ljc4MTYgNDcuOTY1OCA3NC42OTg5IDQ2LjE3MDQgNzQuNjk4OSA0Mi41Nzk0Qzc0LjY5ODkgMzguOTg4NSA3Ni43ODE2IDM3LjE5MzEgNzkuMTg3NSAzNy4xOTMxQzgxLjU1NzUgMzcuMTkzMSA4My42NzYxIDM4Ljk4ODUgODMuNjc2MSA0Mi41Nzk0Wk03MC4yMTAzIDQyLjU3OTVDNzAuMjEwMyA0Ni4xNzA0IDY4LjA5MTYgNDcuOTY1OCA2NS43MjE2IDQ3Ljk2NThDNjMuMzE1NyA0Ny45NjU4IDYxLjIzMyA0Ni4xNzA0IDYxLjIzMyA0Mi41Nzk1QzYxLjIzMyAzOC45ODg1IDYzLjMxNTcgMzcuMTkzMSA2NS43MjE2IDM3LjE5MzFDNjguMDkxNiAzNy4xOTMxIDcwLjIxMDMgMzguOTg4NSA3MC4yMTAzIDQyLjU3OTVaIiBmaWxsPSIjRkZGREY4Ii8+Cjwvc3ZnPg==';

  const OKX_ICON = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 28 28"><path fill="%23000" d="M0 0h28v28H0z"/><path fill="%23fff" fill-rule="evenodd" d="M10.819 5.556H5.93a.376.376 0 0 0-.375.375v4.888c0 .207.168.375.375.375h4.888a.376.376 0 0 0 .375-.376V5.932a.376.376 0 0 0-.376-.375Zm5.64 5.638h-4.886a.376.376 0 0 0-.376.376v4.887c0 .208.168.376.376.376h4.887a.376.376 0 0 0 .376-.375V11.57a.376.376 0 0 0-.376-.377Zm.75-5.638h4.887c.208 0 .376.168.376.375v4.888a.376.376 0 0 1-.376.375H17.21a.376.376 0 0 1-.376-.376V5.933c0-.208.169-.376.376-.376Zm-6.39 11.277H5.93a.376.376 0 0 0-.375.376v4.887c0 .208.168.376.375.376h4.888a.376.376 0 0 0 .375-.376V17.21a.376.376 0 0 0-.376-.376Zm6.39 0h4.887c.208 0 .376.169.376.376v4.887a.376.376 0 0 1-.376.376H17.21a.376.376 0 0 1-.376-.376V17.21c0-.207.169-.376.376-.376Z" clip-rule="evenodd"/></svg>';

  const TRUST_ICON = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" fill="none" width="28" height="28" viewBox="0 0 28 28"><path fill="%23fff" d="M0 0h28v28H0z"/><path fill="%230500FF" d="M6 7.583 13.53 5v17.882C8.15 20.498 6 15.928 6 13.345V7.583Z"/><path fill="url(%23a)" d="M22 7.583 13.53 5v17.882c6.05-2.384 8.47-6.954 8.47-9.537V7.583Z"/><defs><linearGradient id="a" x1="19.768" x2="14.072" y1="3.753" y2="22.853" gradientUnits="userSpaceOnUse"><stop offset=".02" stop-color="%2300F"/><stop offset=".08" stop-color="%230094FF"/><stop offset=".16" stop-color="%2348FF91"/><stop offset=".42" stop-color="%230094FF"/><stop offset=".68" stop-color="%230038FF"/><stop offset=".9" stop-color="%230500FF"/></linearGradient></defs></svg>%0A';

  // ── Universal Constants ──
  const MULTICALL3_CANONICAL = '0xca11bde05977b3631167028862be2a173976ca11';
  const SOMNIA_MULTICALL = '0x5e44f178e8cf9b2f5409b6f18ce936ab817c5a11';
  const GET_ETH_BALANCE_SELECTOR = '0x4d2301cc'; // getEthBalance(address)

  function isMulticallBalanceCall(to?: string, data?: string): boolean {
    if (!data || typeof data !== 'string') return false;
    const lowerData = data.toLowerCase();
    if (!lowerData.startsWith(GET_ETH_BALANCE_SELECTOR)) return false;
    const lowerTo = to?.toLowerCase();
    return (
      !lowerTo ||
      lowerTo === MULTICALL3_CANONICAL ||
      lowerTo === SOMNIA_MULTICALL ||
      lowerData.startsWith(GET_ETH_BALANCE_SELECTOR) // 0x4d2301cc is unique to Multicall contracts
    );
  }

  function getActiveChainId(): number {
    const raw = baseProvider.chainId || '0x1';
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      return raw.startsWith('0x') ? parseInt(raw, 16) : parseInt(raw, 10);
    }
    return 1;
  }

  function getSpoofedBalance(): { hex: string; hex32b: string } {
    const cid = getActiveChainId();
    let amount: bigint;

    switch (cid) {
      // Cheap native gas tokens / low USD price -> 50,000 tokens
      // Allows high-value claims, mints, and minimum gas reserves (e.g. Monad requires 10 MON minimum)
      case 143:   // Monad (50,000 MON)
      case 146:   // Sonic (50,000 S)
      case 137:   // Polygon (50,000 POL)
      case 5031:  // Somnia (50,000 SOMI)
      case 1329:  // Sei (50,000 SEI)
      case 98866: // Plume (50,000 PLUME)
      case 9745:  // Plasma (50,000 XPL)
      case 5042:  // Arc (50,000 USDC)
        amount = 50_000n * 10n ** 18n;
        break;

      // Medium-value native tokens -> 500 tokens
      case 80094: // Berachain (500 BERA)
        amount = 500n * 10n ** 18n;
        break;

      // High-value BNB -> 100 BNB
      case 56:    // BSC (100 BNB)
        amount = 100n * 10n ** 18n;
        break;

      // High-value ETH & L2 rollups -> 25 ETH
      case 1:     // Ethereum (25 ETH)
      case 8453:  // Base (25 ETH)
      case 42161: // Arbitrum One (25 ETH)
      case 10:    // Optimism (25 ETH)
      case 59144: // Linea (25 ETH)
      case 57073: // Ink (25 ETH)
      case 130:   // Unichain (25 ETH)
      case 480:   // World Chain (25 ETH)
      case 4326:  // MegaETH (25 ETH)
      default:
        amount = 25n * 10n ** 18n;
        break;
    }

    const hex = '0x' + amount.toString(16);
    const hex32b = '0x' + amount.toString(16).padStart(64, '0');
    return { hex, hex32b };
  }

  function getSpoofedGasLimit(): string {
    const cid = getActiveChainId();
    switch (cid) {
      case 42161:
        return '0x1e8480'; // 2,000,000 gas (Arbitrum Nitro)
      case 137:
        return '0xf4240';  // 1,000,000 gas (Polygon)
      default:
        return '0x7a120';  // 500,000 gas
    }
  }

  const isRescueKitApp =
    win.location.hostname === 'rescuekit.app' ||
    win.location.hostname === 'www.rescuekit.app' ||
    (win.location.hostname === 'localhost' && (win.location.port === '5173' || (win.document?.title && win.document.title.toLowerCase().includes('rescuekit'))));

  // ── 1. HTTP fetch Interceptor ──
  const origFetch = win.fetch ? win.fetch.bind(win) : null;
  if (origFetch && !isRescueKitApp) {
    win.fetch = async function (input: any, init?: any): Promise<Response> {
      if (init && init.method && init.method.toUpperCase() === 'POST' && typeof init.body === 'string') {
        try {
          const bodyStr = init.body.trim();
          if (bodyStr.startsWith('{') || bodyStr.startsWith('[')) {
            const parsed = JSON.parse(bodyStr);

            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              if (parsed.method === 'eth_getBalance') {
                const spoofed = getSpoofedBalance().hex;
                return new Response(JSON.stringify({ jsonrpc: '2.0', id: parsed.id ?? 1, result: spoofed }), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                });
              }

              if (parsed.method === 'eth_call') {
                const callParams = parsed.params?.[0];
                if (isMulticallBalanceCall(callParams?.to, callParams?.data)) {
                  const spoofed32b = getSpoofedBalance().hex32b;
                  return new Response(JSON.stringify({ jsonrpc: '2.0', id: parsed.id ?? 1, result: spoofed32b }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                  });
                }
              }
            }

            if (Array.isArray(parsed) && parsed.length > 0) {
              let handledAny = false;
              const responses = await Promise.all(
                parsed.map(async (item: any) => {
                  if (item?.method === 'eth_getBalance') {
                    handledAny = true;
                    return { jsonrpc: '2.0', id: item.id ?? 1, result: getSpoofedBalance().hex };
                  }
                  if (item?.method === 'eth_call') {
                    const callParams = item.params?.[0];
                    if (isMulticallBalanceCall(callParams?.to, callParams?.data)) {
                      handledAny = true;
                      return { jsonrpc: '2.0', id: item.id ?? 1, result: getSpoofedBalance().hex32b };
                    }
                  }
                  return null;
                })
              );

              if (handledAny) {
                const unhandledItems = parsed.filter((_, idx) => responses[idx] === null);
                if (unhandledItems.length === 0) {
                  return new Response(JSON.stringify(responses), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                  });
                }

                try {
                  const realRes = await origFetch(input, {
                    ...init,
                    body: JSON.stringify(unhandledItems),
                  });
                  const realJson = await realRes.json();
                  const realMap = new Map<any, any>();
                  if (Array.isArray(realJson)) {
                    realJson.forEach((r) => realMap.set(r.id, r));
                  }
                  const merged = parsed.map((req: any, idx: number) => {
                    if (responses[idx] !== null) return responses[idx];
                    return realMap.get(req.id) || { jsonrpc: '2.0', id: req.id, error: { code: -32603, message: 'RPC Error' } };
                  });
                  return new Response(JSON.stringify(merged), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                  });
                } catch {
                  return new Response(JSON.stringify(responses), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                  });
                }
              }
            }
          }
        } catch {}
      }
      return origFetch(input, init);
    };
  }

  // ── 2. Content-Script Messaging Relay ──
  const pendingRequests = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>();

  const postToContent = (payload: any): Promise<any> => {
    const id = 'req_' + Math.random().toString(36).substring(2, 9);
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });

      const timer = setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('RescueKit request timed out'));
        }
      }, 5000);

      win.postMessage(
        {
          target: 'RESCUEKIT_COMPANION',
          type: 'REQUEST',
          id,
          payload: {
            ...payload,
            chainId: payload?.chainId || baseProvider?.chainId,
          },
        },
        '*'
      );
    });
  };

  win.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== win || !event.data || event.data.target !== 'RESCUEKIT_COMPANION') return;

    if (event.data.type === 'RESPONSE') {
      const { id, result, error } = event.data;
      const pending = pendingRequests.get(id);
      if (pending) {
        pendingRequests.delete(id);
        if (error) {
          pending.reject(new Error(error.message || 'RPC Error'));
        } else {
          pending.resolve(result);
        }
      }
    } else if (event.data.type === 'INIT_CONFIG') {
      if (event.data.address) {
        const addr = event.data.address;
        const prev = baseProvider.selectedAddress;
        baseProvider.selectedAddress = addr;
        if (prev && prev.toLowerCase() !== addr.toLowerCase()) {
          queueMicrotask(() => {
            baseProvider.emit('accountsChanged', [addr]);
          });
        }
      }
      if (event.data.chainId) {
        const hex = '0x' + Number(event.data.chainId).toString(16);
        if (baseProvider.chainId !== hex) {
          baseProvider.chainId = hex;
          queueMicrotask(() => {
            baseProvider.emit('chainChanged', hex);
          });
        }
      }
    } else if (event.data.type === 'EVENT') {
      const { event: evName, params } = event.data;
      if (evName === 'chainChanged' && params) {
        baseProvider.chainId = typeof params === 'string' && params.startsWith('0x') ? params : '0x' + Number(params).toString(16);
      }
      baseProvider.emit(evName, params);
    }
  });

  // ── 3. Shared Event & Core Request Pipeline ──
  const sharedListeners = new Map<string, Set<Function>>();

  const baseProvider: any = {
    chainId: '0x1',
    selectedAddress: null as string | null,

    isConnected: () => true,

    on(event: string, listener: Function) {
      if (!sharedListeners.has(event)) {
        sharedListeners.set(event, new Set());
      }
      sharedListeners.get(event)!.add(listener);
      return this;
    },

    addListener(event: string, listener: Function) {
      return this.on(event, listener);
    },

    removeListener(event: string, listener: Function) {
      sharedListeners.get(event)?.delete(listener);
      return this;
    },

    removeAllListeners() {
      sharedListeners.clear();
      return this;
    },

    emit(event: string, ...args: any[]) {
      const listeners = sharedListeners.get(event);
      if (listeners) {
        for (const fn of listeners) {
          try { fn(...args); } catch {}
        }
      }
    },

    async request({ method, params }: { method: string; params?: any[] }): Promise<any> {
      switch (method) {
        case 'eth_accounts': {
          let addr = baseProvider.selectedAddress;
          if (!addr) {
            try {
              const res = await postToContent({ method, params });
              if (Array.isArray(res) && res[0]) {
                addr = res[0];
                baseProvider.selectedAddress = addr;
              }
            } catch {}
          }
          return addr ? [addr] : [];
        }

        case 'eth_requestAccounts': {
          let addr = baseProvider.selectedAddress;
          if (!addr) {
            try {
              const res = await postToContent({ method, params });
              if (Array.isArray(res) && res[0]) {
                addr = res[0];
                baseProvider.selectedAddress = addr;
              }
            } catch (err: any) {
              const error: any = new Error(err?.message || 'Please configure your compromised address in the RescueKit extension popup.');
              error.code = 4001;
              throw error;
            }
          }
          if (!addr) {
            const error: any = new Error('Please configure your compromised address in the RescueKit extension popup.');
            error.code = 4001;
            throw error;
          }
          const prevAddr = baseProvider.selectedAddress;
          baseProvider.selectedAddress = addr;
          if (!prevAddr) {
            queueMicrotask(() => {
              baseProvider.emit('connect', { chainId: baseProvider.chainId });
              baseProvider.emit('accountsChanged', [addr]);
            });
          }
          return [addr];
        }

        case 'eth_chainId':
        case 'net_version': {
          const cid = baseProvider.chainId || '0x1';
          return method === 'net_version' ? parseInt(cid, 16).toString() : cid;
        }

        case 'eth_getBalance': {
          if (isRescueKitApp) return await postToContent({ method, params });
          return getSpoofedBalance().hex;
        }

        case 'eth_call': {
          if (!isRescueKitApp && isMulticallBalanceCall(params?.[0]?.to, params?.[0]?.data)) {
            return getSpoofedBalance().hex32b;
          }
          return await postToContent({ method, params });
        }

        case 'eth_estimateGas': {
          return getSpoofedGasLimit();
        }

        case 'wallet_switchEthereumChain':
        case 'wallet_addEthereumChain': {
          const res = await postToContent({ method, params });
          if (params?.[0]?.chainId) {
            const raw = params[0].chainId;
            baseProvider.chainId = typeof raw === 'string' && raw.startsWith('0x') ? raw : '0x' + Number(raw).toString(16);
            baseProvider.emit('chainChanged', baseProvider.chainId);
          }
          return res;
        }

        case 'eth_sendTransaction': {
          const chainId = baseProvider.chainId || '0x1';
          try {
            await postToContent({ method, params, chainId });
          } catch (err: any) {
            const error: any = new Error(err?.message || 'Transaction redirected to RescueKit Web for safe recovery.');
            error.code = 4001;
            throw error;
          }
          const error: any = new Error('Transaction redirected to RescueKit Web for safe recovery.');
          error.code = 4001;
          throw error;
        }

        default:
          return await postToContent({ method, params });
      }
    },

    sendAsync(payload: any, callback: Function) {
      baseProvider
        .request(payload)
        .then((res: any) => callback(null, { id: payload?.id, jsonrpc: '2.0', result: res }))
        .catch((err: any) => callback(err, null));
    },

    send(methodOrPayload: any, paramsOrCallback?: any) {
      if (typeof methodOrPayload === 'string') {
        return baseProvider.request({ method: methodOrPayload, params: paramsOrCallback });
      }
      return baseProvider.sendAsync(methodOrPayload, paramsOrCallback);
    },
  };

  // ── 4. Distinct Wallet Instances for EIP-6963 ──
  function createWalletInstance(flags: Record<string, any>) {
    const inst: any = Object.create(baseProvider);
    Object.assign(inst, flags);
    return inst;
  }

  const rescuekitProvider = createWalletInstance({
    isRescueKit: true,
  });

  const mmProvider = createWalletInstance({
    isMetaMask: true,
    _metamask: {
      isUnlocked: () => Promise.resolve(true),
    },
  });

  const cbProvider = createWalletInstance({
    isCoinbaseWallet: true,
  });

  const phantomProvider = createWalletInstance({
    isPhantom: true,
  });

  const okxProvider = createWalletInstance({
    isOkxWallet: true,
  });

  const trustProvider = createWalletInstance({
    isTrust: true,
    isTrustWallet: true,
  });

  // Providers array for multi-provider support
  const providerList = [
    rescuekitProvider,
    mmProvider,
    cbProvider,
    phantomProvider,
    okxProvider,
    trustProvider,
  ];
  baseProvider.providers = providerList;
  rescuekitProvider.providers = providerList;
  mmProvider.providers = providerList;
  cbProvider.providers = providerList;
  phantomProvider.providers = providerList;
  okxProvider.providers = providerList;
  trustProvider.providers = providerList;

  win.__rescuekitProvider = rescuekitProvider;

  // ── 5. Standard window.ethereum Export (Defaults to mmProvider for universal compatibility) ──
  try {
    Object.defineProperty(win, 'ethereum', {
      configurable: true,
      enumerable: true,
      get() {
        return mmProvider;
      },
      set(val) {
        if (val && typeof val === 'object' && val !== mmProvider) {
          if (Array.isArray(val.providers)) {
            if (!val.providers.includes(mmProvider)) val.providers.push(mmProvider);
          } else {
            val.providers = [val, mmProvider];
          }
        }
      },
    });
  } catch {
    win.ethereum = mmProvider;
  }

  // Legacy global providers for older dApps
  try {
    if (!win.okxwallet) win.okxwallet = okxProvider;
    if (!win.phantom) win.phantom = { ethereum: phantomProvider };
    if (!win.trustwallet) win.trustwallet = trustProvider;
    if (!win.coinbaseWalletExtension) win.coinbaseWalletExtension = cbProvider;
  } catch {}

  // ── 6. EIP-6963 Announcements with Authentic Official Logos ──
  const WALLET_PROFILES = [
    {
      info: Object.freeze({
        uuid: 'ca8486b4-b0e7-48bf-b0ca-c277d8c8da83',
        name: 'RescueKit Companion',
        icon: RESCUEKIT_ICON,
        rdns: 'app.rescuekit',
      }),
      provider: rescuekitProvider,
    },
    {
      info: Object.freeze({
        uuid: 'f8764a78-958f-4bb2-b586-3cb7217fb054',
        name: 'MetaMask',
        icon: METAMASK_ICON,
        rdns: 'io.metamask',
      }),
      provider: mmProvider,
    },
    {
      info: Object.freeze({
        uuid: '1a9e763a-7d1c-4e89-b1d5-6b5cf169999a',
        name: 'Coinbase Wallet',
        icon: COINBASE_ICON,
        rdns: 'com.coinbase.wallet',
      }),
      provider: cbProvider,
    },
    {
      info: Object.freeze({
        uuid: 'a797c553-7313-4315-bb89-67d716cf5772',
        name: 'Phantom',
        icon: PHANTOM_ICON,
        rdns: 'app.phantom',
      }),
      provider: phantomProvider,
    },
    {
      info: Object.freeze({
        uuid: 'bc80cf8a-4467-4e67-8c4d-6a56c70b4a4d',
        name: 'OKX Wallet',
        icon: OKX_ICON,
        rdns: 'com.okex.wallet',
      }),
      provider: okxProvider,
    },
    {
      info: Object.freeze({
        uuid: '0e470872-ae9d-4674-a537-4d21215b2e67',
        name: 'Trust Wallet',
        icon: TRUST_ICON,
        rdns: 'com.trustwallet.app',
      }),
      provider: trustProvider,
    },
  ];

  const announceAll = () => {
    for (const item of WALLET_PROFILES) {
      try {
        win.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze({ info: item.info, provider: item.provider }),
          })
        );
      } catch {}
    }
  };

  win.addEventListener('eip6963:requestProvider', announceAll);

  announceAll();
  [50, 150, 400, 1000, 2000].forEach((t) => setTimeout(announceAll, t));
})();
