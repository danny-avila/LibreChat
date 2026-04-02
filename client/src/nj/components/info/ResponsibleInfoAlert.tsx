/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

export default function ResponsibleInfoAlert() {
  return (
    <div
      // prettier-ignore
      className="border-info bg-info-lighter mb-10 w-full border text-primary p-5 rounded"
      role="alert"
    >
      <div className="flex">
        <div className="py-1">
          <svg
            className="mr-4 h-6 w-6 fill-current text-primary"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
          >
            <path d="M2.93 17.07A10 10 0 1 1 17.07 2.93 10 10 0 0 1 2.93 17.07zm12.73-1.41A8 8 0 1 0 4.34 4.34a8 8 0 0 0 11.32 11.32zM9 11V9h2v6H9v-4zm0-6h2v2H9V5z" />
          </svg>
        </div>
        <div className="flex-1">
          <h2 className="mb-4 text-2xl">Using the AI Assistant Responsibly</h2>
        </div>
      </div>
      <p className="mb-6">
        AI tools can generate responses that sound confident but are incorrect or incomplete — these
        are often referred to as “hallucinations”. As a state employee, it is important to review
        the AI’s output for accuracy, bias, completeness, accessibility, and style before using it
        in your work.
      </p>
      <p className="mb-6">
        You can reduce hallucinations by providing clear context, uploading source materials, asking
        the AI Assistant to explain its reasoning, and including prompt instructions for the AI to
        not fabricate or guess any information. Here is an example of{' '}
        <a
          href="https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
          aria-label="guidance for reducing hallucinations (opens in new window)"
        >
          guidance for reducing hallucinations
        </a>
        , and keep an eye out for prompting tips we will add to the tool very soon.
      </p>
      <p className="mb-3">
        As the {''}
        <a
          href="https://innovation.nj.gov/ai-faq-state-employees/"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
          aria-label="state AI FAQ page (opens in new window)"
        >
          state AI FAQ page
        </a>
        {''} outlines, you are responsible for any work that incorporates AI-generated content. All
        employees should complete the mandatory Responsible Use of GenAI training before using the
        NJ AI Assistant or other state-approved AI tools. Training is available through{' '}
        <a
          href="https://my.nj.gov/aui/Login"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
          aria-label="myNJ (opens in new window)"
        >
          myNJ
        </a>
        , as a{' '}
        <a
          href="https://stateofnewjersey.sabacloud.com/Saba/Web_spf/NA9P2PRD001/common/learningeventdetail/curra000000000004900"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
          aria-label="State Learner (opens in new window)"
        >
          State Learner
        </a>{' '}
        or an{' '}
        <a
          href="https://stateofnewjersey-external.sabacloud.com/Saba/Web_spf/NA9P2PRD001/common/learningeventdetail/curra000000000004900"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
          aria-label="External Learner (opens in new window)"
        >
          External Learner
        </a>
        .
      </p>
    </div>
  );
}
