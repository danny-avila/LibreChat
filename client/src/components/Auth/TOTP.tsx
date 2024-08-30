import React, { useState } from 'react';

const TOTP = () => {
  const [totp, setTOTP] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Here you would typically send the TOTP to your backend for verification
    console.log('Submitted TOTP:', totp);
    // Reset the input after submission
    setTOTP('');
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6">
      <div className="mb-4">
        <label
          htmlFor="totp"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Enter TOTP
        </label>
        <input
          type="text"
          id="totp"
          value={totp}
          onChange={(e) => setTOTP(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
          placeholder="Enter your 6-digit code"
          maxLength={6}
          required
        />
      </div>
      <button
        type="submit"
        className="btn-primary w-full transform rounded-2xl px-4 py-3 tracking-wide transition-colors duration-200"
      >
        Verify
      </button>
    </form>
  );
};

export default TOTP;
