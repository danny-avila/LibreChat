import { useMemo, useEffect, memo } from 'react';
import { getConfigDefaults } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import StaticFooter from './StaticFooter'


interface PrivacyPolicyProps {

}

const defaultInterface = getConfigDefaults().interface;

const PrivacyPolicy = memo(
  ({

  }: PrivacyPolicyProps) => {
    const { data: startupConfig } = useGetStartupConfig();
    const interfaceConfig = useMemo(
      () => startupConfig?.interface ?? defaultInterface,
      [startupConfig],
    );

    useEffect(() => {

    }, []);

    return (
      <>
        <header>
            <h1>Privacy Policy</h1>
            <p>Last updated: {new Date().toLocaleDateString()}</p>
        </header>

        <div className="flex flex-col min-h-screen bg-white dark:bg-gray-900 px-6 py-12">
            <div className="max-w-4xl w-full">
                <div className="prose prose-lg dark:prose-invert max-w-none">
                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                            Information We Collect
                        </h2>
                        <p className="text-gray-700 dark:text-gray-300 mb-4">
                            We collect information you provide directly to us, such as when you create an account, 
                            use our services, or contact us for support.
                        </p>
                        <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                            <li>Account information (username, email address)</li>
                            <li>Messages and conversations</li>
                            <li>Usage data and analytics</li>
                            <li>Device and browser information</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                            How We Use Your Information
                        </h2>
                        <p className="text-gray-700 dark:text-gray-300 mb-4">
                            We use the information we collect to:
                        </p>
                        <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                            <li>Provide and improve our services</li>
                            <li>Personalize your experience</li>
                            <li>Communicate with you about updates and support</li>
                            <li>Ensure security and prevent fraud</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                            Data Security
                        </h2>
                        <p className="text-gray-700 dark:text-gray-300">
                            We implement appropriate security measures to protect your personal information 
                            against unauthorized access, alteration, disclosure, or destruction.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                            Your Rights
                        </h2>
                        <p className="text-gray-700 dark:text-gray-300 mb-4">
                            You have the right to:
                        </p>
                        <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                            <li>Access your personal data</li>
                            <li>Correct inaccurate information</li>
                            <li>Delete your account and data</li>
                            <li>Opt out of communications</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                            Contact Us
                        </h2>
                        <p className="text-gray-700 dark:text-gray-300">
                            If you have any questions about this Privacy Policy, please contact us at 
                            info@declaray.com
                        </p>
                    </section>
                </div>
            </div>
        </div>

        <StaticFooter />
      </>
    );
  },
);

PrivacyPolicy.displayName = 'Terms';

export default PrivacyPolicy;
