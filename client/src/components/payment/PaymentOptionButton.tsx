import React from 'react';
import { SiWechat, SiAlipay } from 'react-icons/si';
import { FaCreditCard, FaBitcoin } from 'react-icons/fa';

const PaymentOptionButton = ({ option, isSelected, onClick }) => {
  const icons = {
    wechat_pay: SiWechat,
    alipay: SiAlipay,
    card: FaCreditCard,
    bitcoin: FaBitcoin,
  };

  const Icon = icons[option];

  return (
    <button
      onClick={onClick}
      className={`rounded p-2 ${
        isSelected ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
      } transition-colors duration-150 hover:bg-blue-600 hover:text-white`}
    >
      <Icon size="2.5em" />
    </button>
  );
};

export default PaymentOptionButton;
