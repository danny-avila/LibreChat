// components/payment/TokenOption.tsx
import React from 'react';
import { useLocalize } from '~/hooks';

const TokenOption = ({ tokens, label, price, selectedTokens, onClick }) => {
  const localize = useLocalize();

  return (
    <button
      onClick={onClick}
      className={`flex h-[100px] flex-col items-center justify-between rounded p-3 text-white ${
        selectedTokens === tokens
          ? 'border-4 border-blue-500 bg-green-500'
          : 'border-4-green-500 border-4 bg-green-500 hover:bg-green-600 dark:hover:bg-green-600'
      }`}
    >
      <div className="text-lg font-bold">{localize(label)}</div>
      <div>{localize('com_ui_payment_tokens')}</div>
      <div className="text-sm">{localize(price)}</div>
    </button>
  );
};

export default TokenOption;
