import React, { useState, useEffect } from 'react';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks'; 
import TokenCreditsItem from './TokenCreditsItem';
import AutoRefillSettings from './AutoRefillSettings';

function Balance() {
  const localize = useLocalize();
  const { isAuthenticated, user } = useAuthContext(); 
  const { data: startupConfig } = useGetStartupConfig();

  // This query looks at the 'balances' collection in MongoDB
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && !!startupConfig?.balance?.enabled,
  });
  const balanceData = balanceQuery.data;

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

  const [quantity, setQuantity] = useState(1);

  const getPrice = (qty: number) => {
    const prices = { 1: 250, 2: 450, 3: 600, 4: 720, 5: 850 };
    return prices[qty as keyof typeof prices] || 250;
  };

  /**
   * 🛒 HANDLE PURCHASE
   * Sends the email to your PayMongo server.
   * Your server will use this email to find the '_id' in the 'users' folder,
   * then update the 'tokenCredits' in the 'balances' folder.
   */
  const handlePurchase = () => {
    const userEmail = user?.email || ''; 

    if (!userEmail) {
      alert("Error: No email found in your profile. Please check your settings.");
      return;
    }

    // This URL triggers the logic in your index.js
    const paymentUrl = `https://pay.ryanslab.space/pay?quantity=${quantity}&email=${encodeURIComponent(userEmail)}`;
    
    window.open(paymentUrl, '_blank');
  };

  // 🔄 REFRESH: This is crucial. After the user pays in the other tab, 
  // they click this to pull the new 'tokenCredits' from the 'balances' folder.
  const handleRefresh = () => {
    console.log('🔄 Manually refreshing balance from MongoDB...');
    balanceQuery.refetch();
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-sm text-text-primary">
      {/* Balance Display & Refresh */}
      <div className="flex items-center justify-between">
        <TokenCreditsItem tokenCredits={tokenCredits} />
        <button 
          onClick={handleRefresh}
          disabled={balanceQuery.isFetching}
          className="p-2 hover:bg-surface-tertiary rounded-full transition-colors text-text-tertiary disabled:opacity-50"
          title="Refresh Balance"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="18" height="18" viewBox="0 0 24 24" fill="none" 
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={balanceQuery.isFetching ? "animate-spin" : ""}
          >
            <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
          </svg>
        </button>
      </div>

      {/* Top-up Selection */}
      <div className="mt-2">
        <div className="bg-surface-secondary rounded-xl p-5 border border-border-light shadow-sm">
          <h3 className="font-bold mb-3 text-text-primary uppercase text-[10px] tracking-widest">Token Refill</h3>

          <select 
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value))}
            className="w-full p-3 rounded-lg border border-border-light bg-surface-primary text-text-primary mb-4 outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="1">1 Pack (5M tokens) - ₱250</option>
            <option value="2">2 Packs (10M tokens) - ₱450</option>
            <option value="3">3 Packs (15M tokens) - ₱600</option>
            <option value="4">4 Packs (20M tokens) - ₱720</option>
            <option value="5">5 Packs (25M tokens) - ₱850</option>
          </select>

          <button
            onClick={handlePurchase}
            className="w-full rounded-lg bg-emerald-600 py-3 font-bold text-white transition-all hover:bg-emerald-700 active:scale-95 flex items-center justify-center shadow-md"
          >
            ⚡ Top Up {quantity * 5}M Tokens (₱{getPrice(quantity)})
          </button>
          
          <p className="mt-3 text-center text-[10px] text-text-tertiary italic">
            Refilling for: {user?.email}
          </p>
        </div>
      </div>

      <hr className="border-border-medium" />

      {/* Auto-Refill logic stays untouched */}
      {autoRefillEnabled && (
        hasValidRefillSettings ? (
          <AutoRefillSettings {...{lastRefill, refillAmount, refillIntervalUnit, refillIntervalValue}} />
        ) : (
          <div className="text-sm text-red-600">{localize('com_nav_balance_auto_refill_error')}</div>
        )
      )}
    </div>
  );
}

export default React.memo(Balance);
