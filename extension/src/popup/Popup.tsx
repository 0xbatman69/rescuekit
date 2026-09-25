import React, { useState, useEffect, useRef } from 'react';
import { isAddress, getAddress } from 'viem';
import { CHAINS, type RescueChain } from '@wallet-rescue/chains';
import { getConfig, saveConfig, type CompanionConfig } from '../shared/storage';
import { Check, ExternalLink, Pencil, X } from 'lucide-react';



export function Popup() {
  const [config, setConfig] = useState<CompanionConfig | null>(null);
  const [addressInput, setAddressInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getConfig().then((cfg) => {
      setConfig(cfg);
      const savedAddr = cfg.compromisedAddress || '';
      setAddressInput(savedAddr);
      setIsEditing(!savedAddr);
    });
  }, []);

  const [slotInputText, setSlotInputText] = useState('1');

  useEffect(() => {
    if (typeof config?.claimSlot === 'number') {
      setSlotInputText(String(config.claimSlot));
    }
  }, [config?.claimSlot]);

  const trimmed = addressInput.trim();
  // strict: false allows lowercase, uppercase, and mixed-case addresses without failing EIP-55 checksum check
  const isAddressValid = isAddress(trimmed, { strict: false });
  const isInputDirty = trimmed.length > 0;
  const hasError = isInputDirty && !isAddressValid;

  const handleSaveAddress = async () => {
    if (!isAddressValid) return;
    // Canonicalize to proper EIP-55 checksum
    const normalized = getAddress(trimmed);
    setAddressInput(normalized);
    const updated = await saveConfig({ compromisedAddress: normalized });
    setConfig(updated);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      setIsEditing(false);
    }, 1000);
  };

  const handleStartEdit = () => {
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleCancelEdit = () => {
    setAddressInput(config?.compromisedAddress || '');
    setIsEditing(false);
  };

  const handleSelectChain = async (chainId: number) => {
    const updated = await saveConfig({ chainId });
    setConfig(updated);
  };

  const handleSelectMode = async (mode: 'claim' | 'mint') => {
    const updated = await saveConfig({ mode });
    setConfig(updated);
  };

  const handleSelectSlot = async (claimSlot: number | 'new') => {
    const updated = await saveConfig({ claimSlot });
    setConfig(updated);
  };

  if (!config) return null;

  const activeChain = CHAINS.find((c) => c.viem.id === Number(config.chainId)) || CHAINS[0];

  return (
    <div style={{
      width: '330px',
      background: '#09090b',
      color: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        borderBottom: '1px solid #1f1f23',
        paddingBottom: '12px',
      }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1254 1254"
          width="26"
          height="26"
          style={{ background: '#E5543D', borderRadius: '7px', flexShrink: 0 }}
          fill="#FFFFFF"
        >
          <path d="M372 315h495l120 200-81 150h-138l83-150-47-81H303zM421 550h280l67 115 138 233H771L634 665H354zM426 782h134l-67 116H359z" />
        </svg>
        <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '-0.01em' }}>
          RescueKit Companion
        </div>
      </div>

      {/* Compromised Wallet Field */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '12px', fontWeight: 500, color: '#d4d4d8' }}>
          Compromised Wallet
        </label>
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="0x... (paste compromised address)"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            readOnly={!isEditing}
            style={{
              flex: 1,
              background: isEditing ? '#121215' : '#18181b88',
              border: hasError ? '1px solid #ef4444' : '1px solid #27272a',
              borderRadius: '8px',
              padding: '8px 10px',
              fontSize: '11px',
              fontFamily: 'monospace',
              color: isEditing ? '#ffffff' : '#d4d4d8',
              outline: 'none',
              fontWeight: 400,
              cursor: isEditing ? 'text' : 'default',
            }}
          />
          {isEditing ? (
            <>
              {config.compromisedAddress && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  title="Cancel"
                  style={{
                    background: '#18181b',
                    color: '#a1a1aa',
                    border: '1px solid #27272a',
                    borderRadius: '8px',
                    padding: '0 8px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}
                >
                  <X size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveAddress}
                disabled={!isAddressValid}
                style={{
                  background: !isAddressValid ? '#27272a' : isSaved ? '#22c55e' : '#E5543D',
                  color: !isAddressValid ? '#71717a' : '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0 14px',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: !isAddressValid ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  transition: 'all 0.2s',
                }}
              >
                {isSaved ? <Check size={14} /> : 'Save'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleStartEdit}
              style={{
                background: '#1f1f23',
                color: '#e4e4e7',
                border: '1px solid #2e2e34',
                borderRadius: '8px',
                padding: '0 14px',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                transition: 'all 0.15s',
              }}
            >
              <Pencil size={12} /> Edit
            </button>
          )}
        </div>
        {hasError && (
          <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: 400 }}>
            Please enter a valid 0x address.
          </div>
        )}
      </div>

      {/* Interception Mode Toggle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', fontWeight: 500, color: '#d4d4d8' }}>
            Mode
          </label>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px',
          background: '#121215',
          padding: '3px',
          borderRadius: '8px',
          border: '1px solid #1f1f23',
        }}>
          <button
            type="button"
            onClick={() => handleSelectMode('claim')}
            style={{
              padding: '6px 0',
              borderRadius: '6px',
              border: 'none',
              background: (config.mode || 'claim') === 'claim' ? '#E5543D' : 'transparent',
              color: (config.mode || 'claim') === 'claim' ? '#ffffff' : '#a1a1aa',
              fontSize: '11px',
              fontWeight: 400,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Claim
          </button>
          <button
            type="button"
            onClick={() => handleSelectMode('mint')}
            style={{
              padding: '6px 0',
              borderRadius: '6px',
              border: 'none',
              background: config.mode === 'mint' ? '#E5543D' : 'transparent',
              color: config.mode === 'mint' ? '#ffffff' : '#a1a1aa',
              fontSize: '11px',
              fontWeight: 400,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Mint
          </button>
        </div>
      </div>

      {/* Target Claim Card Slot (only in claim mode) */}
      {(config.mode || 'claim') === 'claim' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', fontWeight: 500, color: '#d4d4d8' }}>
              Target Card
            </label>
            <span style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 400 }}>
              {config.claimSlot === 'new' ? 'Creates new card' : `Overwrites Card #${config.claimSlot || 1}`}
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
            background: '#121215',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid #1f1f23',
          }}>
            <button
              type="button"
              onClick={() => handleSelectSlot(typeof config.claimSlot === 'number' ? config.claimSlot : 1)}
              style={{
                padding: '6px 0',
                borderRadius: '6px',
                border: 'none',
                background: config.claimSlot !== 'new' ? '#E5543D' : 'transparent',
                color: config.claimSlot !== 'new' ? '#ffffff' : '#a1a1aa',
                fontSize: '11px',
                fontWeight: 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Overwrite Card
            </button>
            <button
              type="button"
              onClick={() => handleSelectSlot('new')}
              style={{
                padding: '6px 0',
                borderRadius: '6px',
                border: 'none',
                background: config.claimSlot === 'new' ? '#E5543D' : 'transparent',
                color: config.claimSlot === 'new' ? '#ffffff' : '#a1a1aa',
                fontSize: '11px',
                fontWeight: 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Add New Card
            </button>
          </div>

          {config.claimSlot !== 'new' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: '#121215',
              borderRadius: '8px',
              border: '1px solid #1f1f23',
              padding: '2px',
            }}>
              <button
                type="button"
                onClick={() => {
                  const curr = typeof config.claimSlot === 'number' ? config.claimSlot : 1;
                  handleSelectSlot(Math.max(1, curr - 1));
                }}
                style={{
                  width: '36px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  color: '#d4d4d8',
                  cursor: 'pointer',
                  fontSize: '16px',
                  borderRadius: '6px',
                }}
              >
                -
              </button>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', fontSize: '12px', fontWeight: 400, color: '#ffffff' }}>
                <span style={{ color: '#d4d4d8', fontWeight: 400 }}>Card #</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={slotInputText}
                  onChange={(e) => {
                    let raw = e.target.value.replace(/[^0-9]/g, '');
                    if (raw.startsWith('0')) raw = raw.replace(/^0+/, '');
                    setSlotInputText(raw);
                    const parsed = parseInt(raw, 10);
                    if (!isNaN(parsed) && parsed >= 1) {
                      handleSelectSlot(parsed);
                    }
                  }}
                  onBlur={() => {
                    if (!slotInputText || parseInt(slotInputText, 10) < 1) {
                      setSlotInputText('1');
                      handleSelectSlot(1);
                    }
                  }}
                  style={{
                    width: '32px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid #3f3f46',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 400,
                    textAlign: 'center',
                    padding: '1px 0',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const curr = typeof config.claimSlot === 'number' ? config.claimSlot : 1;
                  handleSelectSlot(curr + 1);
                }}
                style={{
                  width: '36px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  color: '#d4d4d8',
                  cursor: 'pointer',
                  fontSize: '16px',
                  borderRadius: '6px',
                }}
              >
                +
              </button>
            </div>
          )}
        </div>
      )}

      {/* Networks Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', fontWeight: 500, color: '#d4d4d8' }}>
            Network
          </label>
          <span style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 400 }}>
            {activeChain.displayName}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
          {CHAINS.map((c: RescueChain) => {
            const isSelected = activeChain.viem.id === c.viem.id;
            return (
              <button
                key={c.slug}
                onClick={() => handleSelectChain(c.viem.id)}
                style={{
                  padding: '7px 4px',
                  borderRadius: '8px',
                  border: `1px solid ${isSelected ? '#E5543D' : '#1f1f23'}`,
                  background: isSelected ? '#E5543D' : '#121215',
                  color: isSelected ? '#ffffff' : '#a1a1aa',
                  fontSize: '11px',
                  fontWeight: 400,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                {c.displayName}
              </button>
            );
          })}
        </div>
      </div>

      {/* Open Link */}
      <a
        href="https://rescuekit.app"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontSize: '11px',
          color: '#a1a1aa',
          textAlign: 'center',
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          paddingTop: '2px',
          fontWeight: 400,
        }}
      >
        Open RescueKit <ExternalLink size={11} />
      </a>
    </div>
  );
}
