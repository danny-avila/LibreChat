import React from 'react';

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-gray-900">
      <div className="max-w-3xl px-6 py-12">
        <h1 className="mb-8 text-3xl font-bold text-gray-900 dark:text-white">
          Privacy Policy for VestAI
        </h1>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Effective Date: January 20, 2026
        </p>

        <div className="prose prose-gray dark:prose-invert max-w-none">
          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            1. Introduction
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            VestAI (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your
            privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your
            information when you use our AI chat platform.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            2. Information We Collect
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            <strong>Account Information:</strong> When you create an account, we collect your email
            address, username, and password (encrypted).
          </p>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            <strong>Conversation Data:</strong> We store your conversations with AI models to
            provide continuity and improve the service. You can delete your conversations at any
            time.
          </p>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            <strong>Usage Data:</strong> We collect information about how you interact with VestAI,
            including access times, features used, and error logs.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            3. How We Use Your Information
          </h2>
          <ul className="mt-4 list-disc pl-6 text-gray-700 dark:text-gray-300">
            <li>To provide and maintain the VestAI service</li>
            <li>To authenticate your identity and secure your account</li>
            <li>To improve and personalize your experience</li>
            <li>To communicate with you about service updates</li>
            <li>To detect and prevent fraud or abuse</li>
          </ul>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            4. Data Sharing
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            We do not sell your personal information. We may share data with:
          </p>
          <ul className="mt-4 list-disc pl-6 text-gray-700 dark:text-gray-300">
            <li>
              <strong>AI Model Providers:</strong> Your prompts are sent to third-party AI providers
              (OpenAI, Anthropic, etc.) to generate responses
            </li>
            <li>
              <strong>Service Providers:</strong> We use cloud infrastructure providers to host and
              operate VestAI
            </li>
            <li>
              <strong>Legal Requirements:</strong> We may disclose information if required by law
            </li>
          </ul>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            5. Data Security
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            We implement industry-standard security measures including encryption in transit (TLS)
            and at rest, secure authentication, and regular security audits.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            6. Data Retention
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            We retain your data for as long as your account is active. You can request deletion of
            your account and associated data at any time.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            7. Your Rights
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">You have the right to:</p>
          <ul className="mt-4 list-disc pl-6 text-gray-700 dark:text-gray-300">
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Delete your account and data</li>
            <li>Export your conversation history</li>
            <li>Opt out of non-essential communications</li>
          </ul>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            8. Cookies
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            We use essential cookies for authentication and session management. These are necessary
            for the service to function properly.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            9. Changes to This Policy
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            We may update this Privacy Policy from time to time. We will notify you of any changes
            by posting the new policy on this page.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">10. Contact</h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            If you have questions about this Privacy Policy, please contact the VestAI team.
          </p>
        </div>

        <div className="mt-12 border-t border-gray-200 pt-8 dark:border-gray-700">
          <a
            href="/"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            ← Back to VestAI
          </a>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
