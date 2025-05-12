/* eslint-disable react/no-unescaped-entities */
/* eslint-disable i18next/no-literal-string */
import { AnimatedTabs } from '~/components/ui';
import { useSearchContext } from '~/Providers';

export default function Sources() {
  const { searchResults } = useSearchContext();
  const tabs = [
    {
      label: 'Popular',
      content: (
        <ul className="flex flex-col gap-2">
          <li>Answering "What ARIA can I use?"</li>
          <li>Privacy Principles for the Web</li>
          <li>Stepping forward on WAI management</li>
          <li>W3C Accessibility Maturity Model</li>
        </ul>
      ),
    },
    {
      label: 'Recent',
      content: (
        <ul className="flex flex-col gap-2">
          <li>Making WebViews work for the Web</li>
          <li>Remote Meeting Agenda in Development</li>
          <li>W3C Accessibility Maturity Model</li>
          <li>Stepping forward on WAI management</li>
        </ul>
      ),
    },
    {
      label: 'Explore',
      content: (
        <ul className="flex flex-col gap-2">
          <li>W3C Accessibility Maturity Model</li>
          <li>Stepping forward on WAI management</li>
          <li>Answering "What ARIA can I use?"</li>
          <li>Privacy Principles for the Web</li>
        </ul>
      ),
    },
  ];

  return (
    <AnimatedTabs
      tabs={tabs}
      // You can customize further with these props
      // className="custom-container-class"
      // tabListClassName="custom-tablist-class"
      // tabClassName="custom-tab-class"
      // tabPanelClassName="custom-tabpanel-class"
    />
  );
}
