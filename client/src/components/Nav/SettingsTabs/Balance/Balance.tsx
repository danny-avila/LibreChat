import React, { useState } from 'react';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import TokenCreditsItem from './TokenCreditsItem';
import AutoRefillSettings from './AutoRefillSettings';

const PACKS = [
  { id: 1, label: '1 Pack (5M tokens) - ₱250', price: 250, tokens: '5,000,000' },
  { id: 2, label: '2 Packs (10M tokens) - ₱450 (Save ₱50)', price: 450, tokens: '10,000,000' },
  { id: 3, label: '3 Packs (15M tokens) - ₱600 (Save ₱150)', price: 600, tokens: '15,000,000' },
  { id: 5, label: '5 Packs (25M tokens) - ₱850 (Save ₱400)', price: 850, tokens: '25,000,000' },
];

function Balance() {
  const localize = useLocalize();
  const { user, isAuthenticated } = useAuthContext(); // Added 'user' to get the email
  const { data: startupConfig } = useGetStartupConfig();
  
  // Track by ID to ensure the dropdown and the link are always in sync
  const [selectedId, setSelectedId] = useState(1);
  const selectedPack = PACKS.find(p => p.id === selectedId) || PACKS[0];

  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && !!startupConfig?.balance?.enabled,
  });

  const { tokenCredits = 0, autoRefillEnabled = false } = balanceQuery.data ?? {};

  return (
    <div className="flex flex-col gap-4 p-4 text-sm text-text-primary">
      {/* Current Balance Display */}
      <TokenCreditsItem tokenCredits={tokenCredits} />

      {/* --- RECONSTRUCTED TOP-UP BOX --- */}
      <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-5 shadow-sm">
        <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-cyan-600 dark:text-cyan-400">
          Ryan's Lab Credits
        </label>
        
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(Number(e.target.value))}
          className="mb-4 w-full rounded-lg border-2 border-cyan-500 bg-background p-3 text-sm font-bold text-text-primary focus:ring-2 focus:ring-cyan-400"
        >
          {PACKS.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.label}
            </option>
          ))}
        </select>

        {/* CRITICAL UPDATE: 
          We added &email=${user?.email} so your payment page knows WHO to credit.
          We added &amount=${selectedPack.price} so the ₱450 price actually works.
        */}
        <a
          href={`https://pay.ryanslab.space/pay?amount=${selectedPack.price}&qty=${selectedPack.id}&email=${encodeURIComponent(user?.email || '')}&desc=${selectedPack.tokens}_Tokens`}
          target="_blank"
          rel="noreferrer"
          className="flex w-full flex-col items-center justify-center gap-1 rounded-lg bg-cyan-600 py-3 font-bold text-white hover:bg-cyan-700 transition-all active:scale-95 shadow-lg shadow-cyan-500/20"
        >
          <span className="text-base">Top Up {selectedPack.tokens} Tokens</span>
          <span className="text-xs opacity-80 underline">Total to Pay: ₱{selectedPack.price}</span>
        </a>

        <p className="mt-3 text-center text-[9px] font-medium text-text-secondary">
          Credits are tied to: <span className="font-bold text-cyan-600">{user?.email}</span>
        </p>
      </div>

      <hr className="border-border-medium" />

      {!autoRefillEnabled && (
        <div className="text-xs text-gray-500 italic">
          {localize('com_nav_balance_auto_refill_disabled')}
        </div>
      )}
    </div>
  );
}

export default React.memo(Balance);
