import type { Address } from 'viem';

export interface CompanionConfig {
  /** Compromised wallet public address (NO private keys needed) */
  compromisedAddress: string;
  /** Active network chainId (default: 1 Ethereum) */
  chainId: number;
  /** Target RescueKit Web App URL */
  webUrl: string;
  /** Whether the inpage hook is active */
  enabled: boolean;
  /** Intercept target mode: 'claim' | 'mint' */
  mode?: 'claim' | 'mint';
  /** Target claim card slot in web app: 1, 2, 3, or 'new' */
  claimSlot?: number | 'new';
}

export const DEFAULT_CONFIG: CompanionConfig = {
  compromisedAddress: '',
  chainId: 1,
  webUrl: 'https://rescuekit.app',
  enabled: true,
  mode: 'claim',
  claimSlot: 1,
};

export async function getConfig(): Promise<CompanionConfig> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return DEFAULT_CONFIG;
  }
  const data = await chrome.storage.local.get('rescuekit_companion_config');
  const stored = data.rescuekit_companion_config || {};
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    chainId: (typeof stored.chainId === 'number' && !isNaN(stored.chainId)) ? stored.chainId : DEFAULT_CONFIG.chainId,
  };
}

export async function saveConfig(updates: Partial<CompanionConfig>): Promise<CompanionConfig> {
  const curr = await getConfig();
  const next = { ...curr, ...updates };
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ rescuekit_companion_config: next });
  }
  return next;
}
