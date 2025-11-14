/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

export default function LandingText() {
  return (
    <div className="mt-8 max-w-xl text-text-primary">
      <p>
        This is an internal generative artificial intelligence chatbot for use by NJ state employees
        and authorized parties, using the GPT-4o model.
      </p>
      <br />
      <p>
        <strong>Training Requirements:</strong> Before using the NJ AI Assistant, please begin the
        Responsible AI for Public Professionals training course. Access this course{' '}
        <a
          href="https://stateofnewjersey.sabacloud.com/Saba/Web_spf/NA9P2PRD001/common/ledetail/CLIP.RAIPP.WBT/latestversion"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          as a State Learner
        </a>{' '}
        or{' '}
        <a
          href="https://stateofnewjersey-external.sabacloud.com/Saba/Web_spf/NA9P2PRD001/common/ledetail/CLIP.RAIPP.WBT/latestversion"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          as an External Learner
        </a>
        . If you have trouble accessing the course, please email{' '}
        <a href="mailto:clipelearning.support@csc.nj.gov" className="underline">
          clipelearning.support@csc.nj.gov
        </a>
        .
      </p>
      <br />
      <p>
        <strong>New AI Policy & PII:</strong> You can now safely enter personally identifiable
        information (PII) and other sensitive information into the NJ AI Assistant, (
        <a
          href="https://innovation.nj.gov/ai-faq-state-employees/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          as shared in the state&apos;s new AI guidelines
        </a>
        ).
      </p>
      <br />
      <p>
        <strong>Newsletter:</strong>{' '}
        <a
          href="https://public.govdelivery.com/accounts/NJGOV/signup/45878"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Sign up
        </a>{' '}
        for the AI assistant newsletter to stay informed about upcoming and new features.
      </p>
    </div>
  );
}
