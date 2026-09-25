/**
 * @file contentScript.ts
 * Relays between inpage (window.postMessage) and background service worker.
 */
(() => {
  let port: chrome.runtime.Port | null = null;

  function getPort(): chrome.runtime.Port {
    if (!chrome.runtime?.id) {
      throw new Error('Extension context invalidated. Please refresh the page.');
    }
    if (!port) {
      port = chrome.runtime.connect({ name: 'rescuekit-companion' });
      port.onDisconnect.addListener(() => {
        port = null;
      });
      port.onMessage.addListener((msg) => {
        if (msg.type === 'provider-response') {
          window.postMessage(
            {
              target: 'RESCUEKIT_COMPANION',
              type: 'RESPONSE',
              id: msg.id,
              result: msg.result,
              error: msg.error,
            },
            '*'
          );
        } else if (msg.type === 'provider-event') {
          window.postMessage(
            {
              target: 'RESCUEKIT_COMPANION',
              type: 'EVENT',
              event: msg.event,
              params: msg.params,
            },
            '*'
          );
        }
      });
    }
    return port;
  }

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || !event.data || event.data.target !== 'RESCUEKIT_COMPANION') return;
    if (event.data.type === 'REQUEST') {
      try {
        const p = getPort();
        p.postMessage({
          type: 'provider-request',
          id: event.data.id,
          payload: event.data.payload,
          origin: window.location.origin,
          title: document.title,
        });
      } catch (err: any) {
        window.postMessage(
          {
            target: 'RESCUEKIT_COMPANION',
            type: 'RESPONSE',
            id: event.data.id,
            error: { message: err?.message || 'Extension port error', code: -32603 },
          },
          '*'
        );
      }
    }
  });
  function broadcastConfig() {
    try {
      if (!chrome.runtime?.id || !chrome.storage?.local) return;
      chrome.storage.local.get('rescuekit_companion_config', (data) => {
        if (chrome.runtime.lastError) return;
        const cfg = data?.rescuekit_companion_config || {};
        window.postMessage(
          {
            target: 'RESCUEKIT_COMPANION',
            type: 'INIT_CONFIG',
            address: cfg.compromisedAddress || '',
            chainId: cfg.chainId || 1,
          },
          '*'
        );
      });
    } catch {}
  }

  broadcastConfig();

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.rescuekit_companion_config) {
        broadcastConfig();
      }
    });
  } catch {}
})();
