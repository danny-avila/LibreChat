import { useMemo, useEffect, memo } from 'react';
import { getConfigDefaults } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useGetStartupConfig } from '~/data-provider';
import StaticFooter from './StaticFooter'
import '../../custom-theme.css';

interface HelpAndFAQProps {

}

const defaultInterface = getConfigDefaults().interface;

const HelpAndFAQ = memo(
  ({

  }: HelpAndFAQProps) => {
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
            <h1>HELP & FAQ</h1>
            <p>Find answers to common questions and get help with using our platform</p>
        </header>

        <div className="flex flex-col h-full max-w-4xl mx-auto p-6 space-y-8">
            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        Getting Started
                    </h2>
                    
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border">
                        <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                            How do I start a conversation?
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                            Simply type your message in the chat input at the bottom of the screen and press Enter or click the send button.
                        </p>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border">
                        <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                            How often is your AI model updated?
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                            Our real estate market data is refreshed every month to ensure you have access to the latest industry information.
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        Account & Settings
                    </h2>
                    
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border">
                        <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                            How do I change my preferences?
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                            Access your settings by clicking on your profile icon in the top navigation bar.
                        </p>
                    </div>


                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border">
                        <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                            Do my credits expire?
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                            No, your purchased credits do not expire. You can use them at any time, and they will remain available in your account until spent.
                        </p>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border">
                        <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                            Do my credits expire?
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                            No, your purchased credits do not expire. You can use them at any time, and they will remain available in your account until spent.
                        </p>
                    </div>
                    
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border">
                        <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                            How do I cancel my subscription?
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                            You can cancel your subscription at any time by going to the <b>Account</b> menu, selecting <b>Settings</b>, and navigating to the <b>Subscription</b> tab. There, you’ll find an option to manage or cancel your active subscription.
                        </p>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border">
                        <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                            How do I purchase more credits?
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                            To purchase additional credits, go to the <b>Account</b> menu, select <b>Settings</b>, and open the <b>Balance</b> tab. There you can choose a credit package and complete your purchase securely.
                        </p>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border">
                        <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                            Is my conversation data private?
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                            Yes, we take privacy seriously. Your conversations are encrypted and stored securely.
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Troubleshooting
                </h2>
                
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                        The chat isn't responding. What should I do?
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                        Try refreshing the page or checking your internet connection. If the issue persists, contact support.
                    </p>
                </div>
            </div>

            <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Still need help? Contact our support team
                </p>
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors">
                    Contact Support
                </button>
            </div>
        </div>

        <StaticFooter />
      </>
    );
  },
);

HelpAndFAQ.displayName = 'HelpAndFAQ';

export default HelpAndFAQ;
