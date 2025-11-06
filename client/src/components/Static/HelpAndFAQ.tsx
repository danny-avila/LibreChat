import { useMemo, useEffect, memo } from 'react';
import { getConfigDefaults } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';

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
       
    <div className="flex flex-col h-full max-w-4xl mx-auto p-6 space-y-8">
        <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Help & FAQ
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
                Find answers to common questions and get help with using our platform
            </p>
        </div>

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
                        Can I switch between different AI models?
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                        Yes, you can select different models from the dropdown menu before starting a conversation.
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

        <div className="text-center pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
                Still need help? Contact our support team
            </p>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors">
                Contact Support
            </button>
        </div>
    </div>

      </>
    );
  },
);

HelpAndFAQ.displayName = 'HelpAndFAQ';

export default HelpAndFAQ;
