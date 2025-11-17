import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function SubscriptionSuccess() {
  const navigate = useNavigate();
  return (
    <div className="max-w-md mx-auto text-center p-6">
      <h1 className="text-lg font-medium leading-6 text-text-primary">Subscription Successful!</h1>
      <p className="my-4 text-center text-sm font-light text-gray-700 dark:text-white">Your payment was successful and your subscription is now active.</p>
      <button className="rounded-full border-none bg-transparent p-2 hover:bg-surface-hover md:rounded-xl" 
      onClick={() => navigate('/c/new')}>Upload your HOA documents to Declaray now!</button>
    </div>
  );
}
