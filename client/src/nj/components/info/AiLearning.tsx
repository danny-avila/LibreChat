/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import InfoSectionHeader from '~/nj/components/info/InfoSectionHeader';
import InfoLink from '~/nj/components/info/InfoLink';

export default function AiLearning() {
  return (
    <div className="mb-8 mt-8">
      <InfoSectionHeader text="AI Learning Resources" />
      <div className="mb-6 space-y-3">
        <strong>NJ State-Developed Learning Resources</strong>
        <p className="mb-2">
          Responsible Use of GenAI training - Available on the Learning Management System (for {''}
          <a
            href="https://stateofnewjersey.sabacloud.com/Saba/Web_spf/NA9P2PRD001/common/ledetail/CLIP.RAIPP.WBT/latestversion"
            className="underline hover:decoration-2"
            target="_blank"
            rel="noreferrer"
            aria-label="State Learners (opens in new window)"
          >
            State Learners
          </a>{' '}
          and{' '}
          <a
            href="https://stateofnewjersey-external.sabacloud.com/Saba/Web_spf/NA9P2PRD001/common/ledetail/CLIP.RAIPP.WBT/latestversion"
            className="underline hover:decoration-2"
            target="_blank"
            rel="noreferrer"
            aria-label="External Learners (opens in new window)"
          >
            External Learners
          </a>
          )
        </p>
        <InfoLink
          text="NJ Innovation Skills & Resources - Written by NJIA"
          link="https://innovation.nj.gov/skills/"
          aria-label="NJ Innovation Skills & Resources (opens in new window)"
          icon="launch"
        />
        <InfoLink
          text=" GenAI How-To Guides - (includes how to build genAI tools and improve call center menus with GenAI)"
          link="https://innovation.nj.gov/skills/ai-how-tos/"
          aria-label="GenAI How-To Guides (opens in new window)"
          icon="launch"
        />
      </div>
      <div className="mb-6 space-y-3">
        <strong>Other Resources</strong>
        <InfoLink
          text="InnovateUS trainings about AI"
          link="https://innovate-us.org/"
          aria-label="InnovateUS trainings about AI (opens in new window)"
          icon="launch"
        />
        <InfoLink
          text="UK Government Prompt Library"
          link="https://ai.gov.uk/knowledge-hub/prompts"
          aria-label="UK Government Prompt Library (opens in new window)"
          icon="launch"
        />
        <InfoLink
          text="Anthropic’s prompt engineering guide"
          link="https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview"
          aria-label="Anthropic’s prompt engineering guide (opens in new window)"
          icon="launch"
        />
        <InfoLink
          text="Anthropic's guidance to reduce hallucinations"
          link="https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations"
          aria-label="Anthropic's guidance to reduce hallucinations (opens in new window)"
          icon="launch"
        />
        <p className="mb-6">
          (Note: Claude is <em>not</em> an approved tool, do not put any state data into the tool)
        </p>
      </div>
    </div>
  );
}
