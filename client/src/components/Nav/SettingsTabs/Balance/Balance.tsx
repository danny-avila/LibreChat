import React, { useState, useEffect } from 'react';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks'; 
import TokenCreditsItem from './TokenCreditsItem';
import AutoRefillSettings from './AutoRefillSettings';

const PACKS = [
  { id: 1, label: '1 Pack (5M tokens) - ₱250', price: 250 },
  { id: 2, label: '2 Packs (10M tokens) - ₱450', price: 450 },
  { id: 3, label: '3 Packs (15M tokens) - ₱600', price: 600 },
  { id: 4, label: '4 Packs (20M tokens) - ₱720', price: 720 },
  { id: 5, label: '5 Packs (25M tokens) - ₱850', price: 850 },
];

function Balance() {
  const localize = useLocalize();
  const { user, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const [quantity, setQuantity] = useState(1);

  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && !!startupConfig?.balance?.enabled,
  });
  const balanceData = balanceQuery.data;

  // 📝 DEBUG LOG: Check this in your Browser Console (F12)
  useEffect(() => {
    if (balanceData) {
      console.log('📊 UI Balance Data Received:', balanceData);
    }
  }, [balanceData]);

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

  // 🔄 REFRESH: Force-fetches the latest data from MongoDB
  const handleRefresh = () => {
    console.log('🔄 Manually refreshing balance...');
    balanceQuery.refetch();
  };

  const handlePurchase = () => {
    const userId = user?.id || user?._id || '';
    const email = encodeURIComponent(user?.email || '');
    // Using the exact format from your previous version + email for safety
    window.open(
      `https://pay.ryanslab.space/pay?quantity=${quantity}&userId=${userId}&email=${email}`, 
      '_blank'
    );
  };

  const selectedPack = PACKS.find(p => p.id === quantity) || PACKS[0];

  return (
    <div className="flex flex-col gap-4 p-4 text-sm text-text-primary">
      {/* 1. Balance Display & Manual Refresh */}
      <div className="flex items-center justify-between">
        <TokenCreditsItem tokenCredits={tokenCredits} />
        <button 
          onClick={handleRefresh}
          className="rounded-md bg-surface-hover p-2 hover:bg-surface-tertiary transition-colors"
          title="Refresh Balance"
        >
          🔄
        </button>
      </div>

      {/* 2. Top-up Section */}
      <div className="rounded-xl border border-white/10 bg-[#171717] p-6 shadow-lg">
        <label className="mb-3 block text-sm font-bold text-white uppercase tracking-wider">
          Token Top-Up
        </label>
        
        <select
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          className="mb-5 w-full rounded-lg border border-blue-500 bg-[#0d0d0d] p-3 text-sm font-medium text-white"
        >
          {PACKS.map((pack) => (
            <option key={pack.id} value={pack.id}>{pack.label}</option>
          ))}
        </select>

        <button
          onClick={handlePurchase}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#3da37a] py-3 text-sm font-bold text-white transition-all hover:bg-[#46b98b] active:scale-[0.98]"
        >
          <span>⚡</span>
          Pay ₱{selectedPack.price} and Top Up
        </button>

        <div className="mt-3 flex items-center justify-center gap-1 text-[10px] font-bold text-gray-500">
          <span>SECURE CHECKOUT</span>
          <span>•</span>
          <span>USER ID: {user?.id || 'NOT_FOUND'}</span>
        </div>
      </div>

      <hr className="border-white/5" />

      {/* 3. Auto-refill Logic */}
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
        <div className="text-sm text-gray-600 italic">
          {localize('com_nav_balance_auto_refill_disabled')}
        </div>
      )}
    </div>
  );
}

export default React.memo(Balance);
