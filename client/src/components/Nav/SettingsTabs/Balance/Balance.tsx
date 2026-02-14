import React, { useState, useEffect } from 'react';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks'; 
import TokenCreditsItem from './TokenCreditsItem';
import AutoRefillSettings from './AutoRefillSettings';

function Balance() {
  const localize = useLocalize();
  const { isAuthenticated, user } = useAuthContext(); 
  const { data: startupConfig } = useGetStartupConfig();

  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && !!startupConfig?.balance?.enabled,
  });
  const balanceData = balanceQuery.data;

  // 📝 DEBUG LOG: Check if data reaches the UI
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

  const [quantity, setQuantity] = useState(2);

  // NEW: Linear pricing model - ₱50 per 1M tokens
  const getPrice = (qty: number) => {
    return qty * 50; // ₱50 per 1M tokens
  };

  const getTokenAmount = (qty: number) => {
    return `${qty}M`; // e.g., 2M, 3M, etc.
  };

  /**
   * 🛒 HANDLE PURCHASE
   * FIXED: Now combines everything into ONE window.open call.
   * This ensures the PayMongo session gets the email AND userId correctly.
   */
  const handlePurchase = () => {
    const userEmail = user?.email || ''; 
    const userId = user?.id || user?._id || '';

    if (!userEmail) {
      alert("Error: No email found. Please ensure you are logged in.");
      return;
    }

    // The quantity now represents millions of tokens
    const paymentUrl = `https://pay.ryanslab.space/pay?quantity=${quantity}&email=${encodeURIComponent(userEmail)}&userId=${userId}`;
    
    // Open only ONE tab
    window.open(paymentUrl, '_blank');
  };

  // 🔄 REFRESH: Manually trigger a re-fetch after payment
  const handleRefresh = () => {
    console.log('🔄 Manually refreshing balance...');
    balanceQuery.refetch();
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-sm text-text-primary">
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
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className={balanceQuery.isFetching ? "animate-spin" : ""}
          >
            <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
          </svg>
        </button>
      </div>

      <div className="mt-2">
        <div className="bg-surface-secondary rounded-xl p-4 border border-border-light shadow-sm">
          <h3 className="font-semibold mb-2 text-text-primary uppercase text-xs tracking-wider">Choose Token Amount</h3>

          {/* Flexible input field for token quantity */}
          <input
            type="number"
            min="1"
            max="100"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full p-3 rounded-lg border border-border-light bg-surface-primary text-text-primary mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter amount in millions (e.g., 5 = 5M tokens)"
          />

          <button
            onClick={handlePurchase}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-bold text-white transition-all hover:bg-emerald-700 active:scale-95 flex items-center justify-center shadow-md"
          >
            <span className="mr-2">⚡</span> 
            Top Up {getTokenAmount(quantity)} Tokens (₱{getPrice(quantity)})
          </button>

          <p className="mt-2 text-[10px] text-text-tertiary text-center uppercase tracking-wider font-medium">
            ✨ Secure checkout • Credits apply instantly
          </p>
        </div>
      </div>

      <hr className="border-border-medium" />

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
