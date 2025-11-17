import { useMemo, useEffect, memo } from 'react';
import { getConfigDefaults } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import StaticFooter from './StaticFooter'
import '../../custom-theme.css';


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
            <h1>PRIVACY POLICY</h1>
            <p>Last updated: 11/11/2025</p>
        </header>

        <div className="flex flex-col space-y-6 p-6 max-w-4xl mx-auto">
            <div className="prose prose-lg dark:prose-invert max-w-none">
            <section className="mb-8">
                <p>
                We at Cribmetrics (“we”, “our”, or “us”) respect your privacy and are committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website, applications, and related services (“Services”).
                </p>
                <p>
                This policy does not apply to content processed on behalf of business customers (such as API usage), which is governed by separate agreements.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                1. Information We Collect
                </h2>
                <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>
                    <strong>Account Information:</strong> Name, email, account credentials, date of birth, payment details, and transaction history.
                </li>
                <li>
                    <strong>User Content:</strong> Prompts, messages, files, images, audio, and other content you upload or provide.
                </li>
                <li>
                    <strong>Communication Information:</strong> Information you provide when contacting us, such as via email or social media.
                </li>
                <li>
                    <strong>Technical Information:</strong> Log data (IP address, browser type, device info, time and date of access), usage data (features used, actions taken), device and location information, and cookies or similar technologies.
                </li>
                <li>
                    <strong>Information from Other Sources:</strong> Data from partners for security, marketing, or fraud prevention, and publicly available information for model development.
                </li>
                </ul>
            </section>

            <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                2. How We Use Your Information
                </h2>
                <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>To provide, maintain, and improve our Services.</li>
                <li>To personalize your experience and develop new features.</li>
                <li>To communicate with you about updates, support, and events.</li>
                <li>To prevent fraud, ensure security, and comply with legal obligations.</li>
                <li>To analyze usage and conduct research (using aggregated or de-identified data).</li>
                </ul>
                <p className="text-gray-700 dark:text-gray-300 mt-2">
                We may use your content to improve our Services, including training our models. You can opt out of this use by following our published instructions.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                3. Disclosure of Information
                </h2>
                <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>
                    <strong>Vendors & Service Providers:</strong> For business operations, hosting, analytics, payment processing, and support.
                </li>
                <li>
                    <strong>Business Transfers:</strong> In connection with mergers, acquisitions, or other business transactions.
                </li>
                <li>
                    <strong>Legal & Security:</strong> To comply with law, protect rights, prevent fraud, or respond to government requests.
                </li>
                <li>
                    <strong>Affiliates:</strong> With our affiliates for purposes consistent with this policy.
                </li>
                <li>
                    <strong>Business Account Administrators:</strong> If you use a business or enterprise account, administrators may access your account and content.
                </li>
                <li>
                    <strong>Other Users & Third Parties:</strong> When you share content or interact with third-party services.
                </li>
                </ul>
            </section>

            <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                4. Data Retention
                </h2>
                <p className="text-gray-700 dark:text-gray-300">
                We retain your personal data only as long as necessary to provide our Services, resolve disputes, ensure security, or comply with legal obligations. Retention periods depend on the type of data, purpose of processing, and applicable law.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                5. Your Rights
                </h2>
                <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>Access, correct, or delete your personal data.</li>
                <li>Transfer your data to another service (data portability).</li>
                <li>Restrict or object to certain processing.</li>
                <li>Withdraw consent where applicable.</li>
                <li>Lodge a complaint with your local data protection authority.</li>
                </ul>
                <p className="text-gray-700 dark:text-gray-300 mt-2">
                You can exercise some rights through your account settings or by contacting us. We may need to verify your identity before processing requests.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                6. Children’s Privacy
                </h2>
                <p className="text-gray-700 dark:text-gray-300">
                Our Services are not intended for children under 13. We do not knowingly collect personal data from children under 13. If you believe a child has provided us with personal data, please contact us and we will take appropriate action.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                7. Data Security
                </h2>
                <p className="text-gray-700 dark:text-gray-300">
                We use reasonable technical and organizational measures to protect your data. However, no system is completely secure, and you should take care in deciding what information to share.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                8. Changes to This Policy
                </h2>
                <p className="text-gray-700 dark:text-gray-300">
                We may update this Privacy Policy from time to time. We will notify you of material changes as required by law. Please review this page regularly for updates.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                9. Contact Us
                </h2>
                <p className="text-gray-700 dark:text-gray-300">
                If you have any questions or concerns about this Privacy Policy or your data, please contact us at: {process.env.EMAIL_FROM || interfaceConfig.emailFrom || 'info@cribmetrics.com'}
                </p>
            </section>
            </div>
        </div>

        <StaticFooter />
    </>
    );
  },
);

PrivacyPolicy.displayName = 'Terms';

export default PrivacyPolicy;
