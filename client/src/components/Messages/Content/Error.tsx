// file deepcode ignore HardcodedNonCryptoSecret: No hardcoded secrets
import { ViolationTypes, ErrorTypes } from 'librechat-data-provider';
import type { TOpenAIMessage } from 'librechat-data-provider';
import type { LocalizeFunction } from '~/common';
import { formatJSON, extractJson, isJson } from '~/utils/json';
import useLocalize from '~/hooks/useLocalize';
import CodeBlock from './CodeBlock';
import { useState } from 'react';
import { Button } from '~/components/ui/Button';
import PricingModal from './PricingModal';
import { useAuthContext } from '~/hooks/AuthContext';

const localizedErrorPrefix = 'com_error';

type TConcurrent = {
  limit: number;
};

type TMessageLimit = {
  max: number;
  windowInMinutes: number;
};

type TTokenBalance = {
  type: ViolationTypes | ErrorTypes;
  balance: number;
  tokenCost: number;
  promptTokens: number;
  prev_count: number;
  violation_count: number;
  date: Date;
  generations?: TOpenAIMessage[];
};

type TExpiredKey = {
  expiredAt: string;
  endpoint: string;
};

type TInputLength = {
  info: string;
};

const errorMessages = {
  [ErrorTypes.MODERATION]: 'com_error_moderation',
  [ErrorTypes.NO_USER_KEY]: 'com_error_no_user_key',
  [ErrorTypes.INVALID_USER_KEY]: 'com_error_invalid_user_key',
  [ErrorTypes.NO_BASE_URL]: 'com_error_no_base_url',
  [ErrorTypes.INVALID_REQUEST]: `com_error_${ErrorTypes.INVALID_REQUEST}`,
  [ErrorTypes.NO_SYSTEM_MESSAGES]: `com_error_${ErrorTypes.NO_SYSTEM_MESSAGES}`,
  [ErrorTypes.EXPIRED_USER_KEY]: (json: TExpiredKey, localize: LocalizeFunction) => {
    const { expiredAt, endpoint } = json;
    return localize('com_error_expired_user_key', endpoint, expiredAt);
  },
  [ErrorTypes.INPUT_LENGTH]: (json: TInputLength, localize: LocalizeFunction) => {
    const { info } = json;
    return localize('com_error_input_length', info);
  },
  [ViolationTypes.BAN]:
    'Your account has been temporarily banned due to violations of our service.',
  invalid_api_key:
    'Invalid API key. Please check your API key and try again. You can do this by clicking on the model logo in the left corner of the textbox and selecting "Set Token" for the current selected endpoint. Thank you for your understanding.',
  insufficient_quota:
    'We apologize for any inconvenience caused. The default API key has reached its limit. To continue using this service, please set up your own API key. You can do this by clicking on the model logo in the left corner of the textbox and selecting "Set Token" for the current selected endpoint. Thank you for your understanding.',
  concurrent: (json: TConcurrent) => {
    const { limit } = json;
    const plural = limit > 1 ? 's' : '';
    return `Only ${limit} message${plural} at a time. Please allow any other responses to complete before sending another message, or wait one minute.`;
  },
  message_limit: (json: TMessageLimit) => {
    const { max, windowInMinutes } = json;
    const plural = max > 1 ? 's' : '';
    return `You hit the message limit. You have a cap of ${max} message${plural} per ${
      windowInMinutes > 1 ? `${windowInMinutes} minutes` : 'minute'
    }.`;
  },
  token_balance: (json: TTokenBalance) => {
    const { balance, tokenCost, promptTokens, generations } = json;
    const message = `Insufficient Funds! Balance: ${balance}. Prompt tokens: ${promptTokens}. Cost: ${tokenCost}.`;
    return (
      <>
        {message}
        {generations && (
          <>
            <br />
            <br />
          </>
        )}
        {generations && (
          <CodeBlock
            lang="Generations"
            error={true}
            codeChildren={formatJSON(JSON.stringify(generations))}
          />
        )}
      </>
    );
  },
};

const Error = ({ text }: { text: string }) => {
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const localize = useLocalize();
  const { user } = useAuthContext();
  const jsonString = extractJson(text);
  const errorMessage = text.length > 512 && !jsonString ? text.slice(0, 512) + '...' : text;
  const defaultResponse = `Something went wrong. Here's the specific error message we encountered: ${errorMessage}`;

  if (!isJson(jsonString)) {
    return defaultResponse;
  }

  const handleUpgradeClick = () => {
    setIsPricingModalOpen(true);
  };

  errorMessages.token_balance = (json: TTokenBalance) => {
    const { balance, tokenCost, promptTokens, generations } = json;
    const message = `Insufficient Funds! Balance: ${balance}. Prompt tokens: ${promptTokens}. Cost: ${tokenCost}.`;
    return (
      <>
        {message}
        <br />
        <br />
        <Button onClick={handleUpgradeClick}>Upgrade to Pro</Button>
        {generations && (
          <>
            <br />
            <br />
            <CodeBlock
              lang="Generations"
              error={true}
              codeChildren={formatJSON(JSON.stringify(generations))}
            />
          </>
        )}
        {user && (
          <PricingModal
            isOpen={isPricingModalOpen}
            onClose={() => setIsPricingModalOpen(false)}
            userId={user.id}
          />
        )}
      </>
    );
  };

  const json = JSON.parse(jsonString);
  const errorKey = json.code || json.type;
  const keyExists = errorKey && errorMessages[errorKey];

  if (keyExists && typeof errorMessages[errorKey] === 'function') {
    return errorMessages[errorKey](json, localize);
  } else if (keyExists && keyExists.startsWith(localizedErrorPrefix)) {
    return localize(errorMessages[errorKey]);
  } else if (keyExists) {
    return errorMessages[errorKey];
  } else {
    return defaultResponse;
  }
};

export default Error;
