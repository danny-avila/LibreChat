import { useLocalize } from '~/hooks';
import { Dialog } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { useAuthContext } from '~/hooks';

const TermsAndConditionsModal = ({
  open,
  onOpenChange,
  onAccept,
  onDecline,
}: {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onAccept: () => void;
  onDecline: () => void;
}) => {
  const localize = useLocalize();
  const { token } = useAuthContext();

  const handleAccept = async () => {
    try {
      const response = await fetch('/api/user/accept-terms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (response.ok) {
        onAccept();
        onOpenChange(false);
      } else {
        const errorData = await response.json();
        console.error('Failed to accept terms:', errorData.message);
      }
    } catch (error) {
      console.error('Error accepting terms:', error);
    }
  };

  const handleDecline = () => {
    onDecline();
    onOpenChange(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (open && !isOpen) {
      return;
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTemplate
        title={localize('com_ui_terms_and_conditions')}
        className="w-11/12 sm:w-3/4 md:w-1/2 lg:w-2/5"
        showCloseButton={false}
        showCancelButton={false}
        main={
          <div className="max-h-[60vh] overflow-y-auto p-4 text-black dark:text-gray-50">
            <h1 className="mb-4 text-2xl font-bold">Terms of use &quot;42&quot;</h1>
            <h3 className="mb-2 mt-4 text-xl font-bold">1. Scope of application</h3>
            <p className="mb-2">
              42 is an AI-enhanced platform in which MediaMarktSaturn provides easy access to
              company internal knowledge and tools (e.g. in Sharepoint) based on the rights and
              permissions the user already has in a secure environment, as well as advanced data
              analytics and LLM model usage for GPT-4 class models.
            </p>
            <p className="mb-2">
              These terms of use set out the general conditions for the secure use of 42 at
              MediaMarktSaturn.
            </p>
            <h3 className="mb-2 mt-4 text-xl font-bold">2. Permitted uses</h3>
            <p className="mb-2">
              You may only use 42 for internal MediaMarktSaturn business purposes.
            </p>
            <h3 className="mb-2 mt-4 text-xl font-bold">3. Prohibited uses</h3>
            <p className="mb-2">The following uses of the 42 are prohibited:</p>
            <ul className="mb-2 list-disc pl-5">
              <li className="mb-2">
                <strong>
                  The entry of confidential information or personal data is prohibited.
                </strong>
                <ul className="mt-1 list-disc pl-5">
                  <li>
                    The input of confidential information that is not already publicly available and
                    personal data is prohibited. This applies in particular to our customers or
                    employees data, meeting minutes and notes, secret source code, information about
                    our company&apos;s IT architecture or security systems, unpublished marketing
                    materials, product development plans and strategy papers.
                  </li>
                </ul>
              </li>
              <li className="mb-2">
                <strong>
                  The use of 42 in an improper manner or in violation of applicable law is
                  prohibited.
                </strong>
                <ul className="mt-1 list-disc pl-5">
                  <li>
                    Improper or illegal use of 42 is prohibited and is prevented by the
                    provider&apos;s built-in security measures.
                  </li>
                  <li>
                    Please note that such use may be monitored by the provider of the models and in
                    individual cases may be passed on to MediaMarktSaturn. Detected violations may
                    be investigated as part of compliance and may have legal consequences.
                  </li>
                </ul>
              </li>
              <li className="mb-2">
                <strong>
                  In particular, the use under input or generation of content of the following type
                  is prohibited:
                </strong>
                <ul className="mt-1 list-disc pl-5">
                  <li>Violent content and acts (including terrorism and extremism),</li>
                  <li>Exploitation and abuse,</li>
                  <li>Suicide and self-harm,</li>
                  <li>Attempts to bypass safety filters (outside of approved tests)</li>
                  <li>
                    Other harmful or illegal content: including hate speech, discrimination,
                    bullying, abuse, harassment, sexually explicit content, deception,
                    disinformation, malware and exploits, spam, phishing, fraud, surveillance or
                    monitoring of individuals, facial recognition and analysis, misleading claims or
                    automated decision-making in sensitive areas, e.g. finance, law, employment,
                    selling illegal substances, goods or services or instructions on how to make or
                    obtain them, encouraging or enabling crime,
                  </li>
                </ul>
              </li>
            </ul>
            <p className="mb-2">
              Please also refer to the terms of use of the provider:{' '}
              <a
                href="https://learn.microsoft.com/en-us/legal/cognitive-services/openai/code-of-conduct?context=%2Fazure%2Fai-services%2Fopenai%2Fcontext%2Fcontext"
                className="text-blue-500 hover:underline"
              >
                Code of Conduct for the Azure OpenAI Service | Microsoft Learn
              </a>
              .
            </p>
            <ul className="mb-2 list-disc pl-5">
              <li>
                <strong>
                  You may not use or exploit the results of 42 commercially or externally.
                </strong>
              </li>
              <li>
                <strong>
                  You may not reproduce the results of 42 directly in internal documents without a
                  fact check.
                </strong>
              </li>
            </ul>
            <p className="mb-2">
              Always check every response generated by 42 critically for possible incorrect or
              factually inaccurate information. Never rely on AI tools for business-critical or
              time-intensive processes.
            </p>
            <h3 className="mb-2 mt-4 text-xl font-bold">
              4. Further guidelines and data protection
            </h3>
            <p className="mb-2">
              In all other respects, the company&apos;s existing guidelines and regulations apply.
              You will find the data privacy notice{' '}
              <a href="/assets/privacy.html" className="text-blue-500 hover:underline">
                here
              </a>
              .
            </p>
          </div>
        }
        buttons={
          <>
            <button
              onClick={handleDecline}
              className="inline-flex h-10 items-center justify-center rounded-lg border-none bg-gray-500 px-4 py-2 text-sm text-white hover:bg-gray-600 dark:hover:bg-gray-600"
            >
              {localize('com_ui_decline')}
            </button>
            <button
              onClick={handleAccept}
              className="inline-flex h-10 items-center justify-center rounded-lg border-none bg-green-500 px-4 py-2 text-sm text-white hover:bg-green-600 dark:hover:bg-green-600"
            >
              {localize('com_ui_accept')}
            </button>
          </>
        }
      />
    </Dialog>
  );
};

export default TermsAndConditionsModal;
