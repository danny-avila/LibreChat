import { useMutation } from '@tanstack/react-query';
import axios from 'axios';

export const useSubscribeToPlan = () => {
  return useMutation(async (planId: string) => {
    const res = await axios.post('/api/stripe/subscribe', { priceId: planId });
    return res.data;
  });
};
