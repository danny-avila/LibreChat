import React from 'react';
import { useLocalize } from '~/hooks';

const PrivacyPolicy: React.FC = () => {
  const localize = useLocalize();

  return (
    <div className="bg-white px-4 py-8 text-gray-900 dark:bg-gray-900 dark:text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-8 text-4xl font-bold">{localize('com_privacy_policy_title')}</h1>
        <p className="mb-4 text-lg">{localize('com_privacy_policy_last_updated')}</p>
        <p className="mb-8">{localize('com_privacy_policy_intro')}</p>

        <h2 className="mb-4 text-2xl font-bold">
          {localize('com_privacy_policy_info_collection_title')}
        </h2>
        <p className="mb-8">{localize('com_privacy_policy_info_collection_text1')}</p>
        <p className="mb-8">{localize('com_privacy_policy_info_collection_text2')}</p>

        <h2 className="mb-4 text-2xl font-bold">
          {localize('com_privacy_policy_info_sharing_title')}
        </h2>
        <p className="mb-8">{localize('com_privacy_policy_info_sharing_text')}</p>

        <h2 className="mb-4 text-2xl font-bold">
          {localize('com_privacy_policy_user_rights_title')}
        </h2>
        <p className="mb-8">{localize('com_privacy_policy_user_rights_text')}</p>

        <h2 className="mb-4 text-2xl font-bold">
          {localize('com_privacy_policy_data_security_title')}
        </h2>
        <p className="mb-8">{localize('com_privacy_policy_data_security_text')}</p>

        <h2 className="mb-4 text-2xl font-bold">
          {localize('com_privacy_policy_third_party_title')}
        </h2>
        <p className="mb-8">{localize('com_privacy_policy_third_party_text')}</p>

        <h2 className="mb-4 text-2xl font-bold">{localize('com_privacy_policy_children_title')}</h2>
        <p className="mb-8">{localize('com_privacy_policy_children_text')}</p>

        <h2 className="mb-4 text-2xl font-bold">{localize('com_privacy_policy_changes_title')}</h2>
        <p className="mb-8">{localize('com_privacy_policy_changes_text')}</p>

        <h2 className="mb-4 text-2xl font-bold">{localize('com_privacy_policy_contact_title')}</h2>
        <p>{localize('com_privacy_policy_contact_text')}</p>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
