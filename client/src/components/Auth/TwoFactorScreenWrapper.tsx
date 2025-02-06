import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import TwoFactorScreen from './TwoFactorScreen';

const TwoFactorScreenWrapper: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Get the tempToken from query parameters. You might want to add validation.
  const tempToken = searchParams.get('tempToken') || '';

  // Define what should happen if the user cancels 2FA.
  const handleCancel = () => {
    // For example, navigate back to the login page.
    navigate('/login', { replace: true });
  };

  return <TwoFactorScreen tempToken={tempToken} onCancel={handleCancel} />;
};

export default TwoFactorScreenWrapper;