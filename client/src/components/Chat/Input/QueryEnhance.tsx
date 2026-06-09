import { memo, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { useRecoilState } from 'recoil';
import store from '~/store';

function QueryEnhance() {
  const [enabled, setEnabled] = useRecoilState(store.queryEnhanceEnabled);
  const handleChange = useCallback(
    ({ value }: { value: boolean | string }) => {
      setEnabled(Boolean(value));
    },
    [setEnabled],
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
