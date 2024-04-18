export const processBitcoinPayment = async (selectedTokens, selectedOption, userId, email) => {
  console.log('Processing Bitcoin payment for', selectedTokens);
  const description = `Purchase of ${selectedTokens} tokens`;
  const response = await fetch('/api/payment/opennode/create-bitcoin-charge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      tokenAmount: selectedTokens,
      amountCNY: selectedOption.amountCNY,
      selectedTokens: selectedTokens,
      email: email,
      description,
    }),
  });
  const data = await response.json();
  if (data.hosted_checkout_url) {
    window.location.href = data.hosted_checkout_url;
    console.log('Redirecting to', data.hosted_checkout_url);
  } else {
    console.error(
      'Failed to initiate Bitcoin payment',
      data.error || 'Missing hosted_checkout_url',
    );
  }
};
