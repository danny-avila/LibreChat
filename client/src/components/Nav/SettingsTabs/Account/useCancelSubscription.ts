import { useMutation } from '@tanstack/react-query';
import axios from 'axios';

export const useCancelSubscription = () => {
  return useMutation(async () => {
    const res = await axios.post('/api/stripe/cancel-subscription');
    return res.data;
  });
};
