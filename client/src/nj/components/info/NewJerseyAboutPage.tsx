/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import InfoDivider from '~/nj/components/info/InfoDivider';
import InfoTitle from '~/nj/components/info/InfoTitle';
import InfoSectionHeader from '~/nj/components/info/InfoSectionHeader';
import InfoLink from '~/nj/components/info/InfoLink';
import InfoFooter from '~/nj/components/info/InfoFooter';

/**
 * Content for "about the AI assistant" page
 */
export default function NewJerseyAboutPage() {
  document.title = 'NJ AI Assistant - About';

  return (
    <div>
      <InfoTitle text="About the AI Assistant" />

      <InfoDivider />

      <p className="mb-6">
        V 2.0 -Febr.Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam eu eros aliquam,
        facilisis erat eget, aliquam ipsum. Donec a sodales quam. Nulla facilisi. Pellentesque
        congue, neque vel molestie fermentum, ligula metus hendrerit mauris, in various neque tellus
        eget velit. Ut facilisis sapien dolor, non molestie neque auctor non. Nunc cursus nunc
        pulvinar, viverra nibh vitae, hendrerit velit. Morbi luctus nibh eget felis posuere
        suscipit. Vivamus efficitur hendrerit erat tincidunt porta. Suspendisse enim tellus,
        tristique ut ipsum at, posuere pretium turpis. Sed massa ipsum, tincidunt at metus a,
        commodo tincidunt orci.uary 15, 2026
      </p>

      <p className="mb-8">
        V 2.0 -Febr.Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam eu eros aliquam,
        facilisis erat eget, aliquam ipsum. Donec a sodales quam. Nulla facilisi. Pellentesque
        congue, neque vel molestie fermentum, ligula metus hendrerit mauris, in various neque tellus
        eget velit. Ut facilisis sapien dolor, non molestie neque auctor non. Nunc cursus nunc
        pulvinar, viverra nibh vitae, hendrerit velit. Morbi luctus nibh eget felis posuere
        suscipit. Vivamus efficitur hendrerit erat tincidunt porta. Suspendisse enim tellus,
        tristique ut ipsum at, posuere pretium turpis. Sed massa ipsum, tincidunt at metus a,
        commodo tincidunt orci.uary 15, 2026
      </p>

      <InfoDivider />

      <InfoSectionHeader text="Related links" />

      {/* Links List */}
      <div className="mb-6 space-y-3">
        <InfoLink text="Guides and FAQs" link="https://nj.gov" icon="local_library" />

        <InfoLink text="New Jersey Innovation Authority" link="https://nj.gov" icon="launch" />

        <InfoLink
          text="Guidelines on Generative AI use for Public Professionals"
          link="https://nj.gov"
          icon="launch"
        />

        <InfoLink
          text="Responsible AI Use Policy in New Jersey"
          link="https://nj.gov"
          icon="launch"
        />
      </div>

      <InfoDivider />

      <InfoFooter />
    </div>
  );
}
