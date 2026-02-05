import React, { useState } from 'react';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import TokenCreditsItem from './TokenCreditsItem';
import AutoRefillSettings from './AutoRefillSettings';

const PACKS = [
  { id: 1, label: '1 Pack (5,000,000 tokens) - ₱250', price: 250, tokens: '5M' },
  { id: 2, label: '2 Packs (10M tokens) - ₱450 (Save ₱50)', price: 450, tokens: '10M' },
  { id: 3, label: '3 Packs (15M tokens) - ₱600 (Save ₱150)', price: 600, tokens: '15M' },
  { id: 4, label: '4 Packs (20M tokens) - ₱720 (Save ₱280)', price: 720, tokens: '20M' },
  { id: 5, label: '5 Packs (25M tokens) - ₱850 (Save ₱400)', price: 850, tokens: '25M' },
];

function Balance() {
  const localize = useLocalize();
  const { user, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();

  const [selectedId, setSelectedId] = useState(2);
  const selectedPack = PACKS.find((p) => p.id === selectedId) || PACKS[0];

  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && !!startupConfig?.balance?.enabled,
  });
  const balanceData = balanceQuery.data;

  // Preserve all fields for the Auto-Refill logic
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

  // Use fallback to ensure userId is captured for MongoDB
  const userId = user?.id || user?._id || '';

  return (
    <div className="flex flex-col gap-4 p-4 text-sm text-text-primary">
      {/* 1. Balance Display */}
      <TokenCreditsItem tokenCredits={tokenCredits} />

      {/* 2. Top-up Section (Matches your MongoDB 'test.balances' logic) */}
      <div className="rounded-xl border border-white/10 bg-[#171717] p-6 shadow-lg">
        <label className="mb-3 block text-sm font-bold text-white">
          Choose Token Pack
        </label>
        
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(Number(e.target.value))}
          className="mb-5 w-full rounded-lg border border-blue-500 bg-[#0d0d0d] p-3 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {PACKS.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.label}
            </option>
          ))}
        </select>

        <a
          href={`https://pay.ryanslab.space/pay?email=${encodeURIComponent(user?.email || '')}&quantity=${selectedId}&userId=${userId}`}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#3da37a] py-3 text-sm font-bold text-white transition-all hover:bg-[#46b98b] active:scale-[0.98]"
        >
          <span>⚡</span>
          Top Up {selectedPack.tokens} Tokens (₱{selectedPack.price})
        </a>

        <div className="mt-3 flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-tight text-gray-500">
          <span>✨ SECURE CHECKOUT</span>
          <span>•</span>
          <span>CREDITS APPLY INSTANTLY</span>
        </div>
      </div>

      <hr className="border-white/5" />

      {/* 3. Auto-refill logic (Restored exactly as per your original file) */}
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
        <div className="text-sm text-gray-600">
          {localize('com_nav_balance_auto_refill_disabled')}
        </div>
      )}
    </div>
  );
}

export default React.memo(Balance);
