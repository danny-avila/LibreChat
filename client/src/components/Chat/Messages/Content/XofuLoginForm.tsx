import React, { useState, useCallback } from 'react';
import { Button, Label } from '@librechat/client';
import { CheckCircle, Lock, Mail } from 'lucide-react';
import { useAuthContext } from '~/hooks';

interface XofuLoginFormData {
  email: string;
  password: string;
}

interface XofuLoginFormProps {
  onSubmit?: (data: XofuLoginFormData & { token?: string; error?: string }) => void;
  onCancel?: () => void;
  isSubmitted?: boolean;
  isCancelled?: boolean;
  submittedData?: { email: string };
}

const XofuLoginForm: React.FC<XofuLoginFormProps> = ({
  onSubmit,
  onCancel,
  isSubmitted = false,
  isCancelled = false,
  submittedData,
}) => {
  const { token } = useAuthContext();
  const [formData, setFormData] = useState<XofuLoginFormData>({
    email: '',
    password: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = useCallback(
    (field: keyof XofuLoginFormData, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      // Clear error when user starts typing
      if (error) {
        setError(null);
      }
    },
    [error],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!formData.email || !formData.password) {
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        console.log('🔐 Attempting xofu login...');

        // Call LibreChat backend proxy endpoint (handles both login and cookie setting)
        const loginResponse = await fetch('/api/auth/xofu/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
          }),
        });

        if (!loginResponse.ok) {
          const errorData = await loginResponse.json().catch(() => ({ message: 'Unknown error' }));
          console.error('❌ xofu login failed:', {
            status: loginResponse.status,
            statusText: loginResponse.statusText,
            errorBody: errorData,
          });

          // Use server's error message if available
          throw new Error(errorData.message || `Login failed: ${loginResponse.statusText}`);
        }

        const loginData = await loginResponse.json();
        console.log('✅ xofu login successful:', loginData);

        // Call onSubmit with success
        onSubmit?.({
          email: formData.email,
          password: '***',
          token: 'set',
        });
      } catch (error) {
        console.error('❌ xofu login error:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'An error occurred during login';
        setError(errorMessage);

        // Call onSubmit with error for state management
        onSubmit?.({
          email: formData.email,
          password: '***',
          error: errorMessage,
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, onSubmit, token],
  );

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  const isFormValid = () => {
    return !!formData.email && !!formData.password;
  };

  // Cancelled state
  if (isCancelled) {
    return (
      <div className="my-4 rounded-xl border border-red-400 bg-red-50 p-4 shadow-lg dark:bg-red-900/20">
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500"></div>
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
              Login Cancelled
            </h3>
          </div>
          <p className="text-sm text-red-700 dark:text-red-300">
            The xofu login has been cancelled.
          </p>
        </div>
      </div>
    );
  }

  // Submitted state
  if (isSubmitted && submittedData) {
    return (
      <div className="my-4 rounded-xl border-2 border-green-500 bg-gray-800 p-4 shadow-lg">
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <h3 className="text-lg font-semibold text-green-400">xofu Login Successful</h3>
          </div>
          <p className="text-sm text-green-300">You have successfully logged in to xofu.</p>
        </div>

        <div className="space-y-4">
          {/* Email */}
          <div>
            <Label className="mb-2 block text-sm font-medium text-white">Email</Label>
            <div className="flex items-center gap-2 rounded-md border border-green-500 bg-gray-700 px-3 py-2 text-white opacity-75">
              <Mail className="h-4 w-4" />
              <span>{submittedData.email}</span>
            </div>
          </div>

          {/* Authentication Status */}
          <div>
            <Label className="mb-2 block text-sm font-medium text-white">Authentication</Label>
            <div className="flex items-center gap-2 rounded-md border border-green-500 bg-gray-700 px-3 py-2 text-white opacity-75">
              <Lock className="h-4 w-4" />
              <span>Token saved securely</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active form state
  return (
    <div className="my-4 rounded-xl border border-gray-600 bg-gray-800 p-4 shadow-lg">
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500"></div>
          <h3 className="text-lg font-semibold text-white">Login to xofu</h3>
        </div>
        <p className="text-sm text-gray-300">Enter your xofu credentials to authenticate.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Email Field */}
        <div>
          <Label htmlFor="email" className="mb-2 block text-sm font-medium text-white">
            Email <span className="text-red-400">*</span>
          </Label>
          <input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            placeholder="your@email.com"
            className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={isSubmitting}
          />
        </div>

        {/* Password Field */}
        <div>
          <Label htmlFor="password" className="mb-2 block text-sm font-medium text-white">
            Password <span className="text-red-400">*</span>
          </Label>
          <input
            id="password"
            type="password"
            value={formData.password}
            onChange={(e) => handleInputChange('password', e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={isSubmitting}
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-900/20 p-3">
            <p className="text-sm text-red-200">❌ {error}</p>
          </div>
        )}

        {/* Info Box */}
        <div className="rounded-md border border-blue-500/30 bg-blue-900/20 p-3">
          <p className="text-sm text-blue-200">
            🔐 Your credentials are transmitted securely and never stored by LibreChat.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            onClick={handleCancel}
            variant="outline"
            className="flex-1 border-gray-600 bg-transparent text-gray-300 hover:bg-gray-700"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!isFormValid() || isSubmitting}
            className="flex-1 bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                Logging in...
              </span>
            ) : (
              'Login'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default XofuLoginForm;
