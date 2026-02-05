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

  // 📝 DEBUG LOG: Check this in your Browser Console (F12)
  // 📝 DEBUG LOG: Helpful for verifying if the data update reached the frontend
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

  const getPrice = (qty: number) => {
    const prices = { 1: 250, 2: 450, 3: 600, 4: 720, 5: 850 };
    return prices[qty as keyof typeof prices] || 250;
  };

  /**
   * 🛒 HANDLE PURCHASE
   * Switched from userId to email to ensure a more reliable database lookup.
   * Passes the email to the payment server which then maps it to the correct Mongo _id.
   */
  const handlePurchase = () => {
    const userId = user?.id || '';
    // Use the production URL for your payment server
    window.open(
      `https://pay.ryanslab.space/pay?quantity=${quantity}&userId=${userId}`, 
      '_blank'
    );
    const userEmail = user?.email || ''; 

    if (!userEmail) {
      alert("Error: No email found. Please ensure you are logged in.");
      return;
    }

    // Pass email and quantity. encodeURIComponent ensures special characters in emails don't break the URL.
    const paymentUrl = `https://pay.ryanslab.space/pay?quantity=${quantity}&email=${encodeURIComponent(userEmail)}`;
    
    window.open(paymentUrl, '_blank');
  };

  // 🔄 REFRESH: Force-fetches the latest data from MongoDB
  // 🔄 REFRESH: Manually trigger a re-fetch of the balance from the database
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
          <h3 className="font-semibold mb-2 text-text-primary">Choose Token Pack</h3>

          <select 
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value))}
            className="w-full p-3 rounded-lg border border-border-light bg-surface-primary text-text-primary mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="1">1 Pack (5,000,000 tokens) - ₱250</option>
            <option value="2">2 Packs (10M tokens) - ₱450 (Save ₱50)</option>
            <option value="3">3 Packs (15M tokens) - ₱600 (Save ₱150)</option>
            <option value="4">4 Packs (20M tokens) - ₱720 (Save ₱280)</option>
            <option value="5">5 Packs (25M tokens) - ₱850 (Save ₱400)</option>
          </select>

          <button
            onClick={handlePurchase}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-bold text-white transition-all hover:bg-emerald-700 active:scale-95 flex items-center justify-center shadow-md"
          >
            <span className="mr-2">⚡</span> 
            Top Up {quantity * 5}M Tokens (₱{getPrice(quantity)})
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
