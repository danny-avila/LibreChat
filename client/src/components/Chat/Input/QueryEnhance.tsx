import { memo, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { useRecoilState } from 'recoil';
import { useChatFormContext } from '~/Providers';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import store from '~/store';

function QueryEnhance() {
  const [enabled, setEnabled] = useRecoilState(store.queryEnhanceEnabled);
  const methods = useChatFormContext();
  const { submitMessage } = useSubmitMessage();

  const handleChange = useCallback(
    ({ value }: { value: boolean | string }) => {
      const on = Boolean(value);
      /* 항목 8: 입력창에 텍스트가 있으면 토글 대신 즉시 강화 실행 */
      if (on) {
        const currentText = methods.getValues('text') ?? '';
        if (currentText.trim().length > 0) {
          submitMessage({ text: currentText, overrideQueryEnhance: true });
          return;
        }
      }
      setEnabled(on);
    },
    [methods, submitMessage, setEnabled],
  );

  return (
    <CheckboxButton
      className="max-w-fit"
      checked={enabled}
      setValue={handleChange}
      label="쿼리 강화"
      isCheckedClassName="border-blue-600/40 bg-blue-500/10 hover:bg-blue-700/10"
      icon={<Sparkles className="icon-md" aria-hidden="true" />}
    />
  );
}

export default memo(QueryEnhance);
