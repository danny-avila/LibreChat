import React from 'react';
import { topupSubscribeAction } from '~/utils/subscribe';

export default function TopupSubscription() {
  return (
    <button
      onClick={topupSubscribeAction}
      className="rounded-xl bg-green-500 px-3 py-2 text-[13px] text-white transition-all hover:bg-green-400"
    >
      + Add Credits
    </button>
  );
}
