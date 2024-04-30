import React, { useEffect, useState } from 'react';
import axios from 'axios';

const ClaimTokensButton = () => {
  const [isActive, setIsActive] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    const fetchLastTokenClaimTimestamp = async () => {
      try {
        const response = await axios.get('/api/user/last-token-claim');
        const { lastTokenClaimTimestamp } = response.data;
        console.log('Last token claim timestamp:', lastTokenClaimTimestamp);

        const currentTimestamp = new Date().getTime();
        const elapsedTime = currentTimestamp - new Date(lastTokenClaimTimestamp).getTime();
        const remainingTime = Math.max(0, 24 * 60 * 60 * 1000 - elapsedTime);

        console.log('Remaining time:', remainingTime);
        setCountdown(remainingTime);
        setIsActive(remainingTime <= 0);
      } catch (error) {
        console.error('Error fetching last token claim timestamp:', error);
      }
    };

    fetchLastTokenClaimTimestamp();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prevCountdown) => {
        const newCountdown = Math.max(0, prevCountdown - 1000);
        console.log('Updated countdown:', newCountdown);
        return newCountdown;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const handleClaimTokens = async () => {
    try {
      await axios.post('/api/user/claim-tokens');
      setIsActive(false);
      setCountdown(24 * 60 * 60 * 1000);
    } catch (error) {
      console.error('Error claiming tokens:', error);
    }
  };

  const formatTime = (time) => {
    const hours = Math.floor(time / (60 * 60 * 1000));
    const minutes = Math.floor((time % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((time % (60 * 1000)) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  };

  return (
    <button
      className={`rounded px-4 py-2 ${
        isActive
          ? 'bg-blue-500 text-white hover:bg-blue-600'
          : 'cursor-not-allowed bg-gray-300 text-gray-500'
      }`}
      onClick={handleClaimTokens}
      disabled={!isActive}
    >
      {isActive ? 'Claim Tokens' : `Claim in ${formatTime(countdown)}`}
    </button>
  );
};

export default ClaimTokensButton;
