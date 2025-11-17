import { useMutation } from '@tanstack/react-query';
import axios from 'axios';

export const useCreateStripeCheckoutSession = () => {
  return useMutation(async (planId: string) => {
    const res = await axios.post('/api/stripe/create-checkout-session', { priceId: planId });
    return res.data;
  });
};
