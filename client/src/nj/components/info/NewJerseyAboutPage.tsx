/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import { HorizontalRule } from '~/nj/components/info/HorizontalRule';
import InfoTitle from '~/nj/components/info/InfoTitle';
import InfoSectionHeader from '~/nj/components/info/InfoSectionHeader';
import React from 'react';
import RelatedLinks, { RelatedLinkType } from '~/nj/components/info/RelatedLinks';

/**
 * Content for "about the AI assistant" page
 */
export default function NewJerseyAboutPage() {
  document.title = 'NJ AI Assistant - About';

  const relatedLinks: RelatedLinkType[] = [
    {
      title: 'Guides and FAQS',
      href: '/nj/guide',
      icon: 'local_library',
      isInternal: true,
    },
    {
      title: 'New Jersey Innovation Authority',
      href: 'https://innovation.nj.gov/',
      icon: 'launch',
      isInternal: false,
    },
    {
      title: 'Guidelines on Generative AI use for Public Professionals',
      href: 'https://innovation.nj.gov/skills/ai-how-tos/',
      icon: 'launch',
      isInternal: false,
    },
    {
      title: 'Responsible AI Use Policy in New Jersey',
      href: 'https://nj.gov/it/docs/ps/25-OIT-001-State-of-New-Jersey-Guidance-on-Responsible-Use-of-Generative-AI.pdf',
      icon: 'launch',
      isInternal: false,
    },
  ];

  return (
    <div>
      <InfoTitle text="About the AI Assistant" />

      <HorizontalRule spacing="mb-6" />
      <p className="mb-6">
        The NJ AI Assistant (originally launched July 2024) is built by the Platform Team at the{' '}
        <a
          href="https://innovation.nj.gov/"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          NJ Innovation Authority
        </a>
        , a codified state entity formerly known as the NJ Office of Innovation.
      </p>
      <p className="mb-6">
        To share feedback with the team, simply fill out{' '}
        <a
          href="https://forms.office.com/g/zLiSuXxJ0Y"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          this contact form
        </a>{' '}
        or send the team an email directly at{' '}
        <a
          href="mailto:AI.Assistant@innovation.nj.gov"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          AI.Assistant@innovation.nj.gov
        </a>
        .
      </p>
      <p className="mb-6">
        To receive updates about the NJ AI Assistant, please{' '}
        <a
          href="https://public.govdelivery.com/accounts/NJGOV/signup/45878"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          sign up for our newsletter here
        </a>
        .
      </p>

      <InfoSectionHeader text="NJ AI Assistant is a State-Approved AI tool" />
      <p className="mb-6">
        The NJ AI Assistant is one of the{' '}
        <a
          href="https://innovation.nj.gov/ai-faq-state-employees/"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          state-approved AI tools
        </a>{' '}
        for employees to use AI.
      </p>
      <p className="mb-6">
        Employees are required to complete the Responsible Use of GenAI training before using the NJ
        AI Assistant or any other state-approved AI tools. (You can access the training via{' '}
        <a
          href="https://my.nj.gov/aui/Login"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          myNJ
        </a>
        , as a{' '}
        <a
          href="https://stateofnewjersey.sabacloud.com/Saba/Web_spf/NA9P2PRD001/common/learningeventdetail/curra000000000004900"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          State Learner
        </a>{' '}
        or an{' '}
        <a
          href="https://stateofnewjersey-external.sabacloud.com/Saba/Web_spf/NA9P2PRD001/common/learningeventdetail/curra000000000004900"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          External Learner
        </a>
        .)
      </p>
      <p className="mb-6">
        Employees are allowed to enter personally identifiable information (PII) and other sensitive
        information into the NJ AI Assistant. Before doing so, please see the{' '}
        <a
          href="https://innovation.nj.gov/ai-faq-state-employees/"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          official FAQ
        </a>{' '}
        for a list of state-approved tools and the{' '}
        <a
          href="https://nj.gov/it/docs/ps/25-OIT-001-State-of-New-Jersey-Guidance-on-Responsible-Use-of-Generative-AI.pdf"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          State’s current policy
        </a>{' '}
        to guide response use of AI technology to ensure you are following requirements when doing
        so.
      </p>
      <p className="mb-6">
        The NJ AI Assistant was built using government-friendly terms of service and top-notch
        privacy protections: hosting the app and all data on State infrastructure, ensuring the data
        shared is not training third-party AI models, and restricting access to state employees. In
        addition, the NJ AI Assistant has several filters on the AI model to prevent the input or
        output of potentially harmful information, as well as protections to prevent common
        “jailbreaks” and other attempts to circumvent the model’s safeguards.
      </p>

      <HorizontalRule spacing="mb-6" />
      <InfoSectionHeader text="Principles for Building the NJ AI Assistant" />
      <p className="mb-6">
        The team will continue to enhance the NJ AI Assistant by developing new features,
        collaborating with users to understand key needs, and making important decisions along the
        way. These are the principles we use:
      </p>
      <ul className="mb-6 list-outside list-disc pl-8">
        <li className="mb-2">
          <b>Be the safe, go-to AI tool for state employees</b> — integrated into daily work for
          learning and getting things done, with clear information about state approval and
          capabilities.
        </li>
        <li className="mb-2">
          <b>Help users learn and practice responsible AI use</b> — make AI accessible at any skill
          level through practical, bite-sized guidance.
        </li>
        <li className="mb-2">
          <b>Evolve as users and AI technology evolve</b> — stay flexible for human creativity and
          adapt to new AI capabilities and changing needs.
        </li>
        <li className="mb-2">
          <b>Communicate clearly, early, and often</b> — share our roadmap and decisions
          transparently with employees and the public in a friendly, reliable, and accessible way.
        </li>
        <li className="mb-2">
          <b>Empower employees to adopt AI responsibly</b> — build AI knowledge through training and
          resources with built-in guardrails for accurate, responsible use.
        </li>
        <li className="mb-2">
          <b>Drive impact for residents and state workers</b> — help employees serve residents more
          effectively and measure success by real results.
        </li>
      </ul>

      <HorizontalRule spacing="mb-6" />
      <InfoSectionHeader text="History of the NJ AI Assistant" />
      <p className="mb-6">
        The NJ AI Assistant was initially built to quickly get a genAI tool to employees using a
        safe and secure product. It is a cost-effective, powerful, secure tool that has been used
        for over 300,000 sessions (totaling over 1 million prompts) by over 20,000 New Jersey state
        employees. These employees are successfully uncovering new ways to harness AI to operate
        more efficiently and effectively in their work to deliver benefits to the 9.5 million people
        of New Jersey.
      </p>
      <p className="mb-6">
        The launch of the NJ AI Assistant was timed with the release of a now widely-used generative
        AI training course that was developed in partnership with InnovateUS. Given its
        first-of-its-kind nature, that training platform has now been used by more than 25 other
        states and local jurisdictions across the country.
      </p>
      <p className="mb-6">
        The product was rebuilt and relaunched in early 2026. This updated tool included new
        features, an updated AI model, in-app resources on safe and responsible AI use, and multiple
        ways for users to share feedback with the team. This rebuild will also allow NJIA to quickly
        release more features for New Jersey’s public sector professionals in the future.
      </p>
      <p className="mb-6">
        To learn more, please visit the{' '}
        <a
          href="https://innovation.nj.gov/projects/ai-assistant/"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          NJ AI Assistant project page
        </a>{' '}
        on the NJIA website.
      </p>

      <HorizontalRule spacing="mb-6" />
      <InfoSectionHeader text="NJ Innovation Authority" />
      <p className="mb-6">
        The NJ State Office of Innovation was established in 2018 with the focus to deliver
        effective and efficient government for New Jerseyans. It was codified into law as the NJ
        Innovation Authority in 2026. More information about the NJIA can be found online, including
        information about{' '}
        <a
          href="https://innovation.nj.gov/projects/"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          current and past projects
        </a>
        ,{' '}
        <a
          href="https://innovation.nj.gov/impact-report/2025/"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          impact reports
        </a>
        , and innovation skills.
      </p>

      <HorizontalRule spacing="mb-6" />

      <RelatedLinks links={relatedLinks} />
    </div>
  );
}
