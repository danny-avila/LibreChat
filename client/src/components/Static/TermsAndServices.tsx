import { useMemo, useEffect, memo } from 'react';
import { getConfigDefaults } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useGetStartupConfig } from '~/data-provider';
import StaticFooter from './StaticFooter'

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
            <h1>Terms of Service</h1>
        </header>

        <section>
            <div className="flex flex-col space-y-6 p-6 max-w-4xl mx-auto">
                <div className="prose dark:prose-invert max-w-none">
                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                            By accessing and using this service, you accept and agree to be bound by the terms 
                            and provision of this agreement.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold mb-4">2. Use License</h2>
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                            Permission is granted to temporarily download one copy of the materials 
                            on this website for personal, non-commercial transitory viewing only.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold mb-4">3. Disclaimer</h2>
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                            The materials on this website are provided on an 'as is' basis. 
                            We make no warranties, expressed or implied, and hereby disclaim and 
                            negate all other warranties including without limitation, implied warranties 
                            or conditions of merchantability, fitness for a particular purpose, 
                            or non-infringement of intellectual property or other violation of rights.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold mb-4">4. Limitations</h2>
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                            In no event shall the company or its suppliers be liable for any damages 
                            (including, without limitation, damages for loss of data or profit, 
                            or due to business interruption) arising out of the use or inability 
                            to use the materials on this website.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold mb-4">5. Privacy Policy</h2>
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                            Your privacy is important to us. Our Privacy Policy explains how we 
                            collect, use, and protect your information when you use our service.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold mb-4">6. Governing Law</h2>
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                            These terms and conditions are governed by and construed in accordance 
                            with the laws and you irrevocably submit to the exclusive jurisdiction 
                            of the courts in that state or location.
                        </p>
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
