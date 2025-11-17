import { useMemo, useEffect, memo } from 'react';
import { getConfigDefaults } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useGetStartupConfig } from '~/data-provider';
import StaticFooter from './StaticFooter'
import '../../custom-theme.css';

interface TermsAndServicesProps {

}

const defaultInterface = getConfigDefaults().interface;

const TermsAndServices = memo(
  ({

  }: TermsAndServicesProps) => {
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
            <h1>TERMS OF SERVICE</h1>
        </header>

        <section>
            <div className="flex flex-col space-y-6 p-6 max-w-4xl mx-auto">
                <div className="prose dark:prose-invert max-w-none">

                    <section>
                        <h1>Terms of Service</h1>
                        <p><strong>Effective Date:</strong> December 11, 2024</p>
                        <p>Thank you for choosing our platform. These Terms of Service (“Terms”) govern your use of our website, applications, and related services (“Services”). By accessing or using our Services, you agree to be bound by these Terms. Please read them carefully.</p>
                    </section>

                    <section>
                        <h2>1. Who We Are</h2>
                        <p>We are committed to providing innovative AI-powered solutions to help you achieve your goals. For more information about our company and mission, please visit our About page.</p>
                    </section>

                    <section>
                        <h2>2. Registration & Access</h2>
                        <ul>
                            <li><strong>Eligibility:</strong> You must be at least 13 years old (or the minimum age in your country) to use our Services. If you are under 18, you must have permission from a parent or legal guardian.</li>
                            <li><strong>Account Information:</strong> You agree to provide accurate and complete information when registering. You are responsible for maintaining the confidentiality of your account and for all activities under your account.</li>
                            <li><strong>Authority:</strong> If you use our Services on behalf of an organization, you confirm you have the authority to accept these Terms on its behalf.</li>
                        </ul>
                    </section>

                    <section>
                        <h2>3. Using Our Services</h2>
                        <ul>
                            <li><strong>Permitted Use:</strong> You may use our Services in compliance with all applicable laws and our published policies.</li>
                            <li><strong>Prohibited Use:</strong> You may not:
                            <ul>
                                <li>Violate any laws or rights of others.</li>
                                <li>Reverse engineer, copy, sell, or distribute our Services or software.</li>
                                <li>Use our Services for harmful, illegal, or abusive activities.</li>
                                <li>Bypass security features or interfere with the operation of our Services.</li>
                                <li>Use outputs to develop competing models or services.</li>
                            </ul>
                            </li>
                            <li><strong>Third-Party Services:</strong> Our Services may integrate with third-party products or services, which are subject to their own terms.</li>
                            <li><strong>Feedback:</strong> We welcome your feedback and may use it without restriction or compensation.</li>
                        </ul>
                    </section>

                    <section>
                        <h2>4. Content</h2>
                        <ul>
                            <li><strong>Your Content:</strong> You are responsible for any content you provide (“Input”) and any output generated (“Output”). You must have all necessary rights to your Input.</li>
                            <li><strong>Ownership:</strong> You retain ownership of your Input and, to the extent permitted by law, own the Output. We assign to you any rights we may have in the Output.</li>
                            <li><strong>Similarity:</strong> Due to the nature of AI, similar outputs may be generated for different users.</li>
                            <li><strong>Our Use of Content:</strong> We may use Content to improve our Services, comply with law, and enforce our policies. You may opt out of content being used for training by following our published instructions.</li>
                            <li><strong>Accuracy:</strong> AI-generated Output may not always be accurate or reliable. You should not rely solely on Output for critical decisions and should verify information as needed.</li>
                        </ul>
                    </section>

                    <section>
                        <h2>5. Intellectual Property</h2>
                        <p>All rights, title, and interest in our Services, including software and trademarks, remain with us and our licensors. You may only use our brand assets in accordance with our guidelines.</p>
                    </section>

                    <section>
                        <h2>6. Paid Accounts & Billing</h2>
                        <ul>
                            <li><strong>Billing:</strong> If you purchase Services, you agree to provide accurate billing information and authorize us to charge your payment method for recurring fees, taxes, and any applicable charges.</li>
                            <li><strong>Service Credits:</strong> Prepaid credits are subject to our Service Credit Terms.</li>
                            <li><strong>Cancellation:</strong> You may cancel your subscription at any time. Payments are non-refundable except as required by law.</li>
                            <li><strong>Price Changes:</strong> We may update our prices with at least 30 days’ notice for subscription renewals.</li>
                        </ul>
                    </section>

                    <section>
                        <h2>7. Termination & Suspension</h2>
                        <ul>
                            <li>We may suspend or terminate your access if you violate these Terms, applicable law, or if your use poses risk to us or others.</li>
                            <li>You may stop using our Services at any time. We may terminate inactive accounts after one year of inactivity (unless you have a paid account).</li>
                            <li>If you believe your account was terminated in error, you may appeal by contacting support.</li>
                        </ul>
                    </section>

                    <section>
                        <h2>8. Discontinuation of Services</h2>
                        <p>We may discontinue Services with advance notice and will refund any prepaid, unused fees.</p>
                    </section>

                    <section>
                        <h2>9. Disclaimer of Warranties</h2>
                        <p>Our Services are provided “as is” without warranties of any kind. We do not guarantee uninterrupted, error-free, or accurate operation. You use Outputs at your own risk and should not rely on them as your sole source of information.</p>
                    </section>

                    <section>
                        <h2>10. Limitation of Liability</h2>
                        <p>To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages. Our total liability is limited to the greater of $100 or the amount you paid for the Services in the past 12 months.</p>
                    </section>

                    <section>
                        <h2>11. Indemnification</h2>
                        <p>If you are a business or organization, you agree to indemnify us against claims arising from your use of the Services or violation of these Terms.</p>
                    </section>

                    <section>
                        <h2>12. Dispute Resolution</h2>
                        <ul>
                            <li>Any disputes will be resolved through binding arbitration, with exceptions for small claims and certain equitable relief.</li>
                            <li>Class actions and jury trials are waived. Arbitration will be conducted individually, not as a class or group.</li>
                            <li>Florida law governs these Terms, except for its conflict of law rules.</li>
                        </ul>
                    </section>

                    <section>
                        <h2>13. Copyright Complaints</h2>
                        <p>If you believe your copyright has been infringed, please contact us with the required information. We may remove content and terminate repeat infringers as appropriate.</p>
                    </section>

                    <section>
                        <h2>14. General Terms</h2>
                        <ul>
                            <li>You may not assign your rights or obligations under these Terms without our consent.</li>
                            <li>We may update these Terms and will notify you of material changes in advance.</li>
                            <li>If any part of these Terms is unenforceable, the rest remains in effect.</li>
                            <li>You must comply with all applicable trade laws and export controls.</li>
                            <li>These Terms constitute the entire agreement between you and us regarding the Services.</li>
                        </ul>
                    </section>                   
                   

                    <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Last updated: {new Date().toLocaleDateString()}
                        </p>
                    </div>
                </div>
            </div>
        </section>

        <StaticFooter />
      </>
    );
  },
);

TermsAndServices.displayName = 'TermsAndServices';

export default TermsAndServices;
