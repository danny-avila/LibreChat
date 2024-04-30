import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FaRegThumbsUp, FaSpinner } from 'react-icons/fa';

const ClaimTokensButton = ({ refetchBalance }) => {
  const [isActive, setIsActive] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
        return newCountdown;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const handleClaimTokens = async () => {
    try {
      setIsLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 100)); // Fake 100ms delay
      await axios.post('/api/user/claim-tokens');
      setIsActive(false);
      setCountdown(24 * 60 * 60 * 1000);
      setIsSuccess(true);
      refetchBalance(); // Refetch the user's balance

      // Reset success state after 2 seconds
      setTimeout(() => {
        setIsSuccess(false);
      }, 2500);
    } catch (error) {
      console.error('Error claiming tokens:', error);
    } finally {
      setIsLoading(false);
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
    <>
      <button
        className={`relative mb-1 w-full rounded py-1 transition-colors duration-300 ${
          isSuccess
            ? 'bg-green-600 text-white'
            : isActive
              ? 'bg-blue-600 text-white hover:bg-blue-600'
              : 'cursor-not-allowed bg-gray-300 text-gray-500'
        }`}
        onClick={handleClaimTokens}
        disabled={!isActive || isSuccess || isLoading}
      >
        <div className="flex h-6 items-center justify-center">
          {isLoading ? (
            <span className="flex items-center">
              <FaSpinner className="mr-2 animate-spin" />
              Loading...
            </span>
          ) : (
            <>
              <span className={`${isSuccess ? 'invisible' : ''}`}>
                {isActive ? 'Claim 20K Tokens' : `Claim in ${formatTime(countdown)}`}
              </span>
              {isSuccess && (
                <span className="absolute inset-0 flex items-center justify-center animate-in fade-in">
                  <FaRegThumbsUp />
                </span>
              )}
            </>
          )}
        </div>
      </button>
    </>
  );
};

export default ClaimTokensButton;
