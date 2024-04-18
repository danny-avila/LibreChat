// components/payment/paymentUtils.ts
export const fetchTokenBalance = async () => {
  try {
    const response = await fetch('/api/balance');
    return await response.text();
  } catch (error) {
    console.error('Error fetching token balance:', error);
    return null;
  }
};
