import React, { useState, useEffect, useMemo } from 'react';
import { useRecoilState } from 'recoil';
import { request } from 'librechat-data-provider';
import { Dropdown } from '@librechat/client';
import type { Option } from '~/common';
import { useLocalize, useTTSBrowser, useTTSExternal } from '~/hooks';
import { logger } from '~/utils';
import store from '~/store';

export function BrowserVoiceDropdown({ disabled = false }: { disabled?: boolean }) {
  const localize = useLocalize();
  const { voices = [] } = useTTSBrowser();
  const [voice, setVoice] = useRecoilState(store.voice);

  const handleVoiceChange = (newValue?: string | Option) => {
    logger.log('Browser Voice changed:', newValue);
    const newVoice = typeof newValue === 'string' ? newValue : newValue?.value;
    if (newVoice != null) {
      return setVoice(newVoice.toString());
    }
  };

  const labelId = 'browser-voice-dropdown-label';

  return (
    <div className="flex items-center justify-between">
      <div id={labelId}>{localize('com_nav_voice_select')}</div>
      <Dropdown
        key={`browser-voice-dropdown-${voices.length}`}
        value={voice ?? ''}
        options={voices}
        onChange={handleVoiceChange}
        sizeClasses="min-w-[200px] !max-w-[400px] [--anchor-max-width:400px]"
        testId="BrowserVoiceDropdown"
        className="z-50"
        aria-labelledby={labelId}
        disabled={disabled}
      />
    </div>
  );
}

export function ExternalVoiceDropdown({ disabled = false }: { disabled?: boolean }) {
  const localize = useLocalize();
  const { voices = [] } = useTTSExternal();
  const [voice, setVoice] = useRecoilState(store.voice);
  const [accessibleVoices, setAccessibleVoices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchAccessibleVoices = async () => {
      try {
        const data = await request.get<{ name: string }[]>('/api/voices');
        if (active) {
          const names = data.map((v) => v.name);
          setAccessibleVoices(names);
        }
      } catch (err) {
        console.error('Failed to fetch accessible voices:', err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    fetchAccessibleVoices();
    return () => {
      active = false;
    };
  }, []);

  const filteredVoices = useMemo(() => {
    if (loading) {
      return voices;
    }
    return voices.filter((v) => {
      const name = typeof v === 'string' ? v : (v as any)?.value;
      return name && accessibleVoices.includes(name);
    });
  }, [voices, accessibleVoices, loading]);

  useEffect(() => {
    if (!loading && filteredVoices.length > 0 && voice) {
      const filteredNames = filteredVoices.map((v) => (typeof v === 'string' ? v : (v as any)?.value));
      if (!filteredNames.includes(voice)) {
        const firstVoice = typeof filteredVoices[0] === 'string' ? filteredVoices[0] : (filteredVoices[0] as any)?.value;
        if (firstVoice) {
          setVoice(firstVoice);
        }
      }
    }
  }, [loading, filteredVoices, voice, setVoice]);

  const handleVoiceChange = (newValue?: string | Option) => {
    logger.log('External Voice changed:', newValue);
    const newVoice = typeof newValue === 'string' ? newValue : newValue?.value;
    if (newVoice != null) {
      return setVoice(newVoice.toString());
    }
  };

  const labelId = 'external-voice-dropdown-label';

  return (
    <div className="flex items-center justify-between">
      <div id={labelId}>{localize('com_nav_voice_select')}</div>
      <Dropdown
        key={`external-voice-dropdown-${filteredVoices.length}`}
        value={voice ?? ''}
        options={filteredVoices}
        onChange={handleVoiceChange}
        sizeClasses="min-w-[200px] !max-w-[400px] [--anchor-max-width:400px]"
        testId="ExternalVoiceDropdown"
        className="z-50"
        aria-labelledby={labelId}
        disabled={disabled || loading}
      />
    </div>
  );
}
