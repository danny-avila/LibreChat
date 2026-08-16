import React from 'react';
import { RecoilRoot } from 'recoil';
import { renderHook } from '@testing-library/react';
import type { FileConfigInput } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import useClientResize from '../useClientResize';

let mockAdminConfig: FileConfigInput | undefined;
let mockConfigIsSuccess = true;

jest.mock('~/data-provider', () => ({
  useGetFileConfig: <T,>({ select }: { select: (data: unknown) => T }) => ({
    data: select(mockAdminConfig),
    isSuccess: mockConfigIsSuccess,
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => <RecoilRoot>{children}</RecoilRoot>;

const setUserPreference = (value: boolean) =>
  localStorage.setItem('clientImageResize', JSON.stringify(value));

describe('useClientResize', () => {
  beforeEach(() => {
    localStorage.clear();
    mockAdminConfig = undefined;
    mockConfigIsSuccess = true;
  });

  it('keeps resizing off until the file config resolves', () => {
    mockConfigIsSuccess = false;
    setUserPreference(true);

    const { result } = renderHook(() => useClientResize(), { wrapper });

    expect(result.current.isEnabled).toBe(false);
  });

  describe('without an admin-configured value', () => {
    it('follows the user setting when it is off', () => {
      setUserPreference(false);
      const { result } = renderHook(() => useClientResize(), { wrapper });

      expect(result.current.isEnabled).toBe(false);
      expect(result.current.isEnforced).toBe(false);
    });

    it('follows the user setting when it is on', () => {
      setUserPreference(true);
      const { result } = renderHook(() => useClientResize(), { wrapper });

      expect(result.current.isEnabled).toBe(true);
      expect(result.current.isEnforced).toBe(false);
    });

    it('defaults to off when the user has no stored setting', () => {
      const { result } = renderHook(() => useClientResize(), { wrapper });

      expect(result.current.isEnabled).toBe(false);
    });
  });

  describe('with an admin-configured value', () => {
    it('overrides a user setting that is on', () => {
      mockAdminConfig = { clientImageResize: { enabled: false } };
      setUserPreference(true);
      const { result } = renderHook(() => useClientResize(), { wrapper });

      expect(result.current.isEnabled).toBe(false);
      expect(result.current.isEnforced).toBe(true);
    });

    it('overrides a user setting that is off', () => {
      mockAdminConfig = { clientImageResize: { enabled: true } };
      setUserPreference(false);
      const { result } = renderHook(() => useClientResize(), { wrapper });

      expect(result.current.isEnabled).toBe(true);
      expect(result.current.isEnforced).toBe(true);
    });

    it('applies resize parameters while leaving the toggle to the user', () => {
      mockAdminConfig = { clientImageResize: { maxWidth: 1024, quality: 0.8 } };
      setUserPreference(true);
      const { result } = renderHook(() => useClientResize(), { wrapper });

      expect(result.current.isEnabled).toBe(true);
      expect(result.current.isEnforced).toBe(false);
      expect(result.current.config.maxWidth).toBe(1024);
      expect(result.current.config.quality).toBe(0.8);
    });
  });

  it('returns the original file untouched while disabled', async () => {
    mockAdminConfig = { clientImageResize: { enabled: false } };
    setUserPreference(true);
    const { result } = renderHook(() => useClientResize(), { wrapper });

    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    const outcome = await result.current.resizeImageIfNeeded(file);

    expect(outcome.resized).toBe(false);
    expect(outcome.file).toBe(file);
  });
});
