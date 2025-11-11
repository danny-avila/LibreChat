import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function SubscriptionCancel() {
  const navigate = useNavigate();
  return (
    <div style={{ maxWidth: 480, margin: '2rem auto', textAlign: 'center' }}>
      <h1>Subscription Canceled</h1>
      <p>Your payment or subscription process was canceled. No changes have been made.</p>
      <button onClick={() => navigate('/')}>Home</button>
    </div>
  );
}
