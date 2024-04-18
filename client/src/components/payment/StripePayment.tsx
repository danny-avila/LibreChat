import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(
  'pk_live_51MwvEEHKD0byXXCl8IzAvUl0oZ7RE6vIz72lWUVYl5rW3zy0u3FiGtIAgsbmqSHbhkTJeZjs5VEbQMNStaaQL9xQ001pwxI3RP',
);

export const processStripePayment = async (selectedOption, paymentMethod, userId, email) => {
  const { priceId } = selectedOption;

  const res = await fetch('/api/payment/stripe/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceId, userId, domain: 'gptchina.io', email, paymentMethod }),
  });

  console.log('res', res);
  const data = await res.json();
  const stripe = await stripePromise;
  const { error } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
  if (error) {
    console.error('Stripe Checkout Error:', error);
  }
};
