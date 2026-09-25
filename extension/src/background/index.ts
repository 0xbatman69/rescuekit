import { isAddress } from 'viem';
import { findChainById, createRescueClient, type RescueChain } from '@wallet-rescue/chains';
import { getConfig, saveConfig } from '../shared/storage';

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'rescuekit-companion') return;

  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'provider-request') return;

    const { id, payload, origin, title, injectedChainId } = msg;
    const { method, params } = payload;

    try {
      const config = await getConfig();
      if (!config.enabled) {
        port.postMessage({
          type: 'provider-response',
          id,
          error: { message: 'RescueKit Companion is disabled', code: -32603 },
        });
        return;
      }

      const result = await handleRequest(
        port,
        id,
        method,
        params,
        config,
        origin,
        title,
        injectedChainId || payload?.chainId
      );

      port.postMessage({
        type: 'provider-response',
        id,
        result,
      });
    } catch (err: any) {
      port.postMessage({
        type: 'provider-response',
        id,
        error: { message: err?.message || 'Internal RPC error', code: -32603 },
      });
    }
  });
});

async function handleRequest(
  port: chrome.runtime.Port,
  id: string,
  method: string,
  params: any[] | undefined,
  config: any,
  origin: string,
  title: string,
  injectedChainId?: any
): Promise<any> {
  // Resolve chain: if dApp provides a chainId, prioritize it; fallback to configured chain
  const rawTargetChain = injectedChainId;
  let activeChainId = config.chainId;
  if (rawTargetChain) {
    const parsedId = typeof rawTargetChain === 'string' && rawTargetChain.startsWith('0x')
      ? parseInt(rawTargetChain, 16)
      : Number(rawTargetChain);
    if (!isNaN(parsedId) && parsedId > 0) {
      activeChainId = parsedId;
    }
  }

  const selectedChain = findChainById(activeChainId) || findChainById(config.chainId);

  switch (method) {
    case 'eth_requestAccounts':
    case 'eth_accounts': {
      const configured = config.compromisedAddress?.trim();
      if (!configured || !isAddress(configured)) {
        if (method === 'eth_accounts') {
          return [];
        }
        const err: any = new Error('No address configured. Please set your compromised address in the RescueKit extension popup.');
        err.code = 4001;
        throw err;
      }
      return [configured];
    }

    case 'eth_chainId':
    case 'net_version': {
      const cid = selectedChain?.viem.id || config.chainId;
      const hexChain = cid ? '0x' + cid.toString(16) : '0x1';
      return method === 'net_version' ? String(cid || 1) : hexChain;
    }

    case 'wallet_switchEthereumChain':
    case 'wallet_addEthereumChain': {
      const targetHex = params?.[0]?.chainId;
      if (targetHex) {
        const targetId = typeof targetHex === 'string' && targetHex.startsWith('0x')
          ? parseInt(targetHex, 16)
          : Number(targetHex);
        await saveConfig({ chainId: targetId });
        const hex = typeof targetHex === 'string' && targetHex.startsWith('0x')
          ? targetHex
          : '0x' + targetId.toString(16);
        port.postMessage({
          type: 'provider-event',
          event: 'chainChanged',
          params: hex,
        });
        return null;
      }
      return null;
    }

    case 'eth_sendTransaction': {
      const txParams = params?.[0];
      if (!txParams || !txParams.to || typeof txParams.to !== 'string' || !isAddress(txParams.to.trim())) {
        throw new Error('Invalid or missing contract address in transaction parameters.');
      }

      const to = txParams.to.trim();
      const rawData = txParams.data || txParams.input || '0x';
      const data = typeof rawData === 'string' && rawData.startsWith('0x') ? rawData : '0x';
      const value = String(txParams.value ?? '0');

      // Auto-detect target chain: if the dApp or transaction targets a specific chain,
      // auto-switch the extension and redirect with that network pre-selected!
      const txChainRaw = txParams.chainId || injectedChainId;
      let targetChain = selectedChain;
      if (txChainRaw) {
        const txId = typeof txChainRaw === 'string' && txChainRaw.startsWith('0x')
          ? parseInt(txChainRaw, 16)
          : Number(txChainRaw);
        const matched = findChainById(txId);
        if (matched) {
          targetChain = matched;
          // Auto-switch extension storage to match the transaction's chain
          if (config.chainId !== matched.viem.id) {
            await saveConfig({ chainId: matched.viem.id });
          }
        }
      }

      const baseWebUrl = config.webUrl || 'https://rescuekit.app';
      const targetRoute = config.mode === 'mint' ? 'mint' : 'claim';

      // Build safe query parameters
      const queryParams = new URLSearchParams();
      queryParams.set('contract', to);
      if (targetChain?.displayName) {
        queryParams.set('network', targetChain.displayName);
      }
      if (value && value !== '0') {
        queryParams.set('value', value);
      }
      if (config.compromisedAddress && isAddress(config.compromisedAddress)) {
        queryParams.set('compromised', config.compromisedAddress);
      }
      if (config.mode === 'mint') {
        queryParams.set('mode', 'mint-and-transfer');
      }
      if (targetRoute === 'claim') {
        queryParams.set('box', String(config.claimSlot || 1));
      }

      // Safe URL length handling (RFC 3986):
      // Proxies/CDNs (Vercel/Cloudflare) reject query strings exceeding ~4KB with HTTP 414 URI Too Long.
      // Massive Merkle airdrop proofs (e.g., Merkl, CowSwap) often contain 30-60+ proof hashes producing calldata > 3KB-10KB.
      // URL hash fragments (#...) are client-side only and NEVER sent over the wire to CDN servers,
      // supporting up to 2MB in modern browsers.
      // We pass calldata in the query string if short (< 1500 chars), or in the hash fragment if large (> 1500 chars).
      let redirectUrl: string;
      if (data.length > 1500) {
        redirectUrl = `${baseWebUrl}/${targetRoute}?${queryParams.toString()}#calldata=${encodeURIComponent(data)}`;
      } else {
        queryParams.set('calldata', data);
        redirectUrl = `${baseWebUrl}/${targetRoute}?${queryParams.toString()}`;
      }

      // Cache latest intercepted transaction in extension storage as an extra redundancy layer
      try {
        await chrome.storage.local.set({
          latest_intercepted_tx: {
            to,
            data,
            value,
            network: targetChain?.displayName || 'Ethereum',
            compromised: config.compromisedAddress || '',
            mode: config.mode,
            timestamp: Date.now(),
          },
        });
      } catch {}

      try {
        const tabs = await chrome.tabs.query({ url: ['*://rescuekit.app/*', '*://www.rescuekit.app/*'] });
        if (tabs.length > 0 && tabs[0].id) {
          await chrome.tabs.update(tabs[0].id, { url: redirectUrl, active: true });
          if (tabs[0].windowId) {
            try { await chrome.windows.update(tabs[0].windowId, { focused: true }); } catch {}
          }
        } else {
          await chrome.tabs.create({ url: redirectUrl, active: true });
        }
      } catch {
        await chrome.tabs.create({ url: redirectUrl, active: true });
      }

      const redirectErr: any = new Error('Transaction redirected to RescueKit Web for safe execution.');
      redirectErr.code = 4001;
      throw redirectErr;
    }

    default: {
      if (!selectedChain) return null;
      const client = createRescueClient(selectedChain);
      return await client.request({
        method: method as any,
        params: params as any,
      });
    }
  }
}
