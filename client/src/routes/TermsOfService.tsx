import React from 'react';

const TermsOfService: React.FC = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-gray-900">
      <div className="max-w-3xl px-6 py-12">
        <h1 className="mb-8 text-3xl font-bold text-gray-900 dark:text-white">
          Terms of Service for VestAI
        </h1>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Effective Date: January 20, 2026
        </p>

        <div className="prose prose-gray dark:prose-invert max-w-none">
          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            1. Acceptance of Terms
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            By accessing or using VestAI, you acknowledge that you have read, understood, and agree
            to be bound by these Terms of Service. If you do not agree to these terms, please do not
            use the service.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            2. Description of Service
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            VestAI is an AI-powered chat platform that provides access to various large language
            models for conversational AI purposes. The service allows users to interact with AI
            assistants, create custom agents, and manage conversations.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            3. User Accounts
          </h2>
          <ul className="mt-4 list-disc pl-6 text-gray-700 dark:text-gray-300">
            <li>You must provide accurate and complete information when creating an account</li>
            <li>You are responsible for maintaining the confidentiality of your account credentials</li>
            <li>You are responsible for all activities that occur under your account</li>
            <li>You must notify us immediately of any unauthorized use of your account</li>
          </ul>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            4. Acceptable Use
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            You agree not to use VestAI to:
          </p>
          <ul className="mt-4 list-disc pl-6 text-gray-700 dark:text-gray-300">
            <li>Generate harmful, illegal, abusive, or malicious content</li>
            <li>Violate any applicable laws or regulations</li>
            <li>Infringe on intellectual property rights of others</li>
            <li>Harass, threaten, or harm other users or individuals</li>
            <li>Distribute malware, spam, or engage in phishing</li>
            <li>Attempt to reverse engineer, hack, or compromise the security of the service</li>
            <li>Use the service for any commercial purpose without authorization</li>
            <li>Circumvent any usage limits or restrictions</li>
          </ul>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            5. AI-Generated Content
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            You acknowledge that:
          </p>
          <ul className="mt-4 list-disc pl-6 text-gray-700 dark:text-gray-300">
            <li>AI responses may not always be accurate, complete, or appropriate</li>
            <li>You should verify important information from authoritative sources</li>
            <li>AI-generated content should not be used for medical, legal, or financial advice</li>
            <li>You are responsible for how you use AI-generated content</li>
          </ul>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            6. Intellectual Property
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            All content, features, and functionality of VestAI are owned by VestAI and are protected
            by copyright, trademark, and other intellectual property laws. You retain ownership of
            content you input, but grant us a license to process it for service delivery.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            7. Third-Party Services
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            VestAI integrates with third-party AI providers (such as OpenAI, Anthropic, Google, and
            AWS). Your use of these services through VestAI is also subject to their respective terms
            and policies.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            8. Limitation of Liability
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            VestAI is provided &quot;as is&quot; and &quot;as available&quot; without warranties of
            any kind, either express or implied. We are not liable for any indirect, incidental,
            special, consequential, or punitive damages arising from your use of the service.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            9. Service Modifications
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            We reserve the right to modify, suspend, or discontinue VestAI at any time, with or
            without notice. We may also update these Terms from time to time. Continued use of the
            service after changes constitutes acceptance of the modified Terms.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            10. Termination
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            We may terminate or suspend your access to VestAI at our discretion, without prior
            notice, for conduct that we believe violates these Terms or is harmful to other users,
            us, or third parties.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">
            11. Governing Law
          </h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            These Terms shall be governed by and construed in accordance with applicable laws,
            without regard to conflict of law principles.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-gray-900 dark:text-white">12. Contact</h2>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            If you have any questions about these Terms of Service, please contact the VestAI team.
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

export default TermsOfService;
