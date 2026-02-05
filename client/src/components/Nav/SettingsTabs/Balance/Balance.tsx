import React, { useState } from 'react';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import TokenCreditsItem from './TokenCreditsItem';
import AutoRefillSettings from './AutoRefillSettings';

const PACKS = [
  { id: 1, label: '1 Pack (5,000,000 tokens) - ₱250', price: 250 },
  { id: 2, label: '2 Packs (10M tokens) - ₱450 (Save ₱50)', price: 450 },
  { id: 3, label: '3 Packs (15M tokens) - ₱600 (Save ₱150)', price: 600 },
  { id: 4, label: '4 Packs (20M tokens) - ₱720 (Save ₱280)', price: 720 },
  { id: 5, label: '5 Packs (25M tokens) - ₱850 (Save ₱400)', price: 850 },
];

function Balance() {
  const localize = useLocalize();
  // We pull 'user' here to get the 'id' and 'email' for your webhook
  const { user, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();

  const [selectedId, setSelectedId] = useState(1);
  const selectedPack = PACKS.find(p => p.id === selectedId) || PACKS[0];

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
      {/* Current Balance Display */}
      <TokenCreditsItem tokenCredits={tokenCredits} />

      {/* --- RECONSTRUCTED TOP-UP BOX --- */}
      <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-5 shadow-sm">
        <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
          Ryan's Lab Refill
        </label>
        
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(Number(e.target.value))}
          className="mb-4 w-full rounded-lg border-2 border-blue-500 bg-background p-3 text-sm font-bold text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {PACKS.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.label}
            </option>
          ))}
        </select>

        {/* CRITICAL FIXES HERE: 
          1. We use 'quantity' (not qty) to match your: const { email, quantity } = req.query;
          2. We use 'userId' to match your webhook: const userId = metadata.userId;
        */}
        <a
          href={`https://pay.ryanslab.space/pay?email=${encodeURIComponent(user?.email || '')}&quantity=${selectedId}&userId=${user?.id}`}
          target="_blank"
          rel="noreferrer"
          className="flex w-full flex-col items-center justify-center gap-1 rounded-lg bg-blue-600 py-3 font-bold text-white hover:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-500/20"
        >
          <span className="text-base">Top Up {selectedId * 5}M Tokens</span>
          <span className="text-xs opacity-80 underline">Confirm Payment: ₱{selectedPack.price}</span>
        </a>

        <p className="mt-3 text-center text-[9px] font-medium text-text-secondary italic">
          Credits will be added to: <span className="font-bold">{user?.email}</span>
        </p>
      </div>

      <hr className="border-border-medium" />

      {/* Auto-refill logic */}
      {autoRefillEnabled ? (
        hasValidRefillSettings ? (
          <AutoRefillSettings
            lastRefill={lastRefill}
            refillAmount={refillAmount}
            refillIntervalUnit={refillIntervalUnit}
            refillIntervalValue={refillIntervalValue}
          />
        ) : (
          <div className="text-sm text-red-600 font-medium">
            {localize('com_nav_balance_auto_refill_error')}
          </div>
        )
      ) : (
        <div className="text-sm text-gray-500 italic">
          {localize('com_nav_balance_auto_refill_disabled')}
        </div>
      )}
    </div>
  );
}

export default React.memo(Balance);
