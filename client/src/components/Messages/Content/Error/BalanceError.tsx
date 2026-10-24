import { ViolationTypes } from 'librechat-data-provider';
import type { ErrorRendererProps } from './parts';
import { useBalanceDisplay } from '~/hooks/useBalanceSummary';
import { ErrorBody, readNumber, readString } from './parts';
import { useLocalize } from '~/hooks';

export default function BalanceError({ json }: ErrorRendererProps) {
  const localize = useLocalize();
  const { display } = useBalanceDisplay();
  const type = readString(json, 'type');
  const balance = readNumber(json, 'balance');
  const tokenCost = readNumber(json, 'tokenCost');

  if (type === ViolationTypes.PERSONAL_SPEND_LIMIT) {
    return (
      <ErrorBody>
        <p>{localize('com_error_personal_spend_limit')}</p>
      </ErrorBody>
    );
  }

  let summary = localize('com_error_limit_reached');
  if (tokenCost != null && balance != null) {
    if (display === 'percent') {
      summary = localize('com_error_token_balance_hidden');
    } else if (display === 'currency') {
      summary = localize('com_error_token_balance_currency');
    } else {
      summary = localize('com_error_token_balance');
    }
  }

  return (
    <ErrorBody>
      <p>{summary}</p>
    </ErrorBody>
  );
}
