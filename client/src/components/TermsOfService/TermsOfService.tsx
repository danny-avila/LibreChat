import React from 'react';
import { useLocalize } from '~/hooks';

const TermsOfService: React.FC = () => {
  const localize = useLocalize();

  return (
    <div className="bg-white px-4 py-8 text-gray-900 dark:bg-gray-900 dark:text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-8 text-4xl font-bold">{localize('com_terms_title')}</h1>
        <p className="mb-4 text-lg">{localize('com_terms_effective_date')}</p>
        <p className="mb-8">{localize('com_terms_intro')}</p>

        <h2 className="mb-4 text-2xl font-bold">
          {localize('com_terms_service_description_title')}
        </h2>
        <p className="mb-8">{localize('com_terms_service_description_text')}</p>

        <h2 className="mb-4 text-2xl font-bold">
          {localize('com_terms_user_responsibilities_title')}
        </h2>
        <p className="mb-8">{localize('com_terms_user_responsibilities_text')}</p>

        <h2 className="mb-4 text-2xl font-bold">
          {localize('com_terms_intellectual_property_title')}
        </h2>
        <p className="mb-8">{localize('com_terms_intellectual_property_text')}</p>

        <h2 className="mb-4 text-2xl font-bold">
          {localize('com_terms_user_generated_content_title')}
        </h2>
        <p className="mb-8">{localize('com_terms_user_generated_content_text')}</p>

        <h2 className="mb-4 text-2xl font-bold">
          {localize('com_terms_service_availability_title')}
        </h2>
        <p className="mb-8">{localize('com_terms_service_availability_text')}</p>

        <h2 className="mb-4 text-2xl font-bold">{localize('com_terms_termination_title')}</h2>
        <p className="mb-8">{localize('com_terms_termination_text')}</p>

        <h2 className="mb-4 text-2xl font-bold">
          {localize('com_terms_disclaimer_liability_title')}
        </h2>
        <p className="mb-8">{localize('com_terms_disclaimer_liability_text')}</p>

        <h2 className="mb-4 text-2xl font-bold">
          {localize('com_terms_dispute_resolution_title')}
        </h2>
        <p className="mb-8">{localize('com_terms_dispute_resolution_text')}</p>

        <h2 className="mb-4 text-2xl font-bold">{localize('com_terms_changes_title')}</h2>
        <p className="mb-8">{localize('com_terms_changes_text')}</p>

        <h2 className="mb-4 text-2xl font-bold">{localize('com_terms_contact_title')}</h2>
        <p>{localize('com_terms_contact_text')}</p>
      </div>
    </div>
  );
};

export default TermsOfService;
