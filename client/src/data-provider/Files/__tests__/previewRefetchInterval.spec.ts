import type { TFilePreview } from 'librechat-data-provider';
import { PREVIEW_MAX_CONSECUTIVE_ERRORS, previewRefetchInterval } from '../queries';

const q = (fetchFailureCount: number) => ({ state: { fetchFailureCount } });

describe('previewRefetchInterval', () => {
  it('polls every 2.5s when no data has arrived yet', () => {
    expect(previewRefetchInterval(undefined, q(0))).toBe(2500);
  });

  it('keeps polling while server reports pending', () => {
    expect(previewRefetchInterval({ file_id: 'x', status: 'pending' }, q(0))).toBe(2500);
  });

  it('stops on terminal ready', () => {
    const data: TFilePreview = {
      file_id: 'x',
      status: 'ready',
      text: 'x',
      textFormat: 'html',
    };
    expect(previewRefetchInterval(data, q(0))).toBe(false);
  });

  it('stops on terminal failed', () => {
    const data: TFilePreview = { file_id: 'x', status: 'failed', previewError: 'oops' };
    expect(previewRefetchInterval(data, q(0))).toBe(false);
  });

  it('keeps polling on transient error (no data + low failure count)', () => {
    /* Regression for the bug where `data?.status === 'pending' ? 2500 : false`
     * killed polling on the first error: data was undefined, callback
     * returned false, the chip stuck "Preparing preview…" forever. */
    expect(previewRefetchInterval(undefined, q(1))).toBe(2500);
    expect(previewRefetchInterval(undefined, q(PREVIEW_MAX_CONSECUTIVE_ERRORS - 1))).toBe(2500);
  });

  it('caps polling after MAX_CONSECUTIVE_ERRORS so a permanently-broken endpoint stops', () => {
    expect(previewRefetchInterval(undefined, q(PREVIEW_MAX_CONSECUTIVE_ERRORS))).toBe(false);
    expect(previewRefetchInterval(undefined, q(PREVIEW_MAX_CONSECUTIVE_ERRORS + 5))).toBe(false);
  });

  it('cap also applies when last successful data was pending and subsequent polls error', () => {
    const data: TFilePreview = { file_id: 'x', status: 'pending' };
    expect(previewRefetchInterval(data, q(PREVIEW_MAX_CONSECUTIVE_ERRORS))).toBe(false);
  });
});
