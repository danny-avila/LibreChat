import React, { useState } from 'react';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import TokenCreditsItem from './TokenCreditsItem';
import AutoRefillSettings from './AutoRefillSettings';

// The Tiered Pricing Logic
const PACKS = [
  { id: 1, label: '1 Pack (5,000,000 tokens) - ₱250', price: 250, tokens: '5M' },
  { id: 2, label: '2 Packs (10M tokens) - ₱450 (10% OFF)', price: 450, tokens: '10M' },
  { id: 3, label: '3 Packs (15M tokens) - ₱600 (20% OFF)', price: 600, tokens: '15M' },
  { id: 4, label: '4 Packs (20M tokens) - ₱720 (Save ₱280)', price: 720, tokens: '20M' },
  { id: 5, label: '5 Packs (25M tokens) - ₱850 (Save ₱400)', price: 850, tokens: '25M' },
];

function Balance() {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  
  // State to handle the selector
  const [selectedPack, setSelectedPack] = useState(PACKS[0]);

  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && !!startupConfig?.balance?.enabled,
  });
  const balanceData = balanceQuery.data;

  const {
    tokenCredits = 0,
    autoRefillEnabled = false,
    lastRefill,
    refillAmount,
    refillIntervalUnit,
    refillIntervalValue,
  } = balanceData ?? {};

  const hasValidRefillSettings =
    lastRefill !== undefined &&
    refillAmount !== undefined &&
    refillIntervalUnit !== undefined &&
    refillIntervalValue !== undefined;

  return (
    <div className="flex flex-col gap-4 p-4 text-sm text-text-primary">
      {/* 1. Token Credits Display */}
      <TokenCreditsItem tokenCredits={tokenCredits} />

      {/* 2. Custom Top-up Section with Discount Logic */}
      <div className="flex flex-col gap-3 rounded-xl border border-border-medium bg-surface-secondary p-5 shadow-sm">
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-text-secondary">
            Select Top-up Amount
          </label>
          <select
            value={selectedPack.id}
            onChange={(e) => {
              const pack = PACKS.find(p => p.id === Number(e.target.value));
              if (pack) setSelectedPack(pack);
            }}
            className="w-full rounded-lg border-2 border-cyan-500 bg-background p-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            {PACKS.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.label}
              </option>
            ))}
          </select>
        </div>

        {/* Dynamic Checkout Button */}
        <a
          href={`https://pay.ryanslab.space/pay?amount=${selectedPack.price}&qty=${selectedPack.id}`}
          target="_blank"
          rel="noreferrer"
          className="group flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 py-3 font-bold text-white hover:bg-cyan-700 transition-all active:scale-95 shadow-md"
        >
          <span>🚀</span>
          Top-up {selectedPack.tokens} (₱{selectedPack.price})
        </a>

        <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-widest text-text-secondary opacity-70">
          ⚡ Discount automatically applied for 2+ packs
        </p>
      </div>

      <hr className="border-border-medium" />

      {/* 3. Auto-refill display logic */}
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">Subscription Settings</h3>
        {autoRefillEnabled ? (
          hasValidRefillSettings ? (
            <AutoRefillSettings
              lastRefill={lastRefill}
              refillAmount={refillAmount}
              refillIntervalUnit={refillIntervalUnit}
              refillIntervalValue={refillIntervalValue}
            />
          ) : (
            <div className="text-sm text-red-600">
              {localize('com_nav_balance_auto_refill_error')}
            </div>
          )
        ) : (
          <div className="text-sm text-gray-500 italic">
            {localize('com_nav_balance_auto_refill_disabled')}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(Balance);
