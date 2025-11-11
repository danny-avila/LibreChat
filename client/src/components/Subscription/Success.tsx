import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function SubscriptionSuccess() {
  const navigate = useNavigate();
  return (
    <div style={{ maxWidth: 480, margin: '2rem auto', textAlign: 'center' }}>
      <h1>Subscription Successful!</h1>
      <p>Your payment was successful and your subscription is now active.</p>
      <button onClick={() => navigate('/c/new')}>Upload your HOA documents to Declaray now!</button>
    </div>
  );
}
