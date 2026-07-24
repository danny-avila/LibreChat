import { useState, useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import store from '~/store';
import { useAuthContext } from '~/hooks';

export function useVideoCall() {
  const [isCallActive, setIsCallActive] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const { token: jwtToken } = useAuthContext();
  const setGlobalIsVideoCallActive = useSetRecoilState(store.isVideoCallActive);

  const startCall = useCallback(async (conversationId?: string, endpoint?: string) => {
    try {
      // 1. Get config
      const configRes = await fetch('/api/livekit/config', {
        headers: { Authorization: `Bearer ${jwtToken}` }
      });
      if (!configRes.ok) {
        throw new Error('Failed to fetch LiveKit configuration');
      }
      const configData = await configRes.json();
      let dynamicWsUrl = configData.wsUrl.replace('localhost', window.location.hostname).replace('127.0.0.1', window.location.hostname);
      
      // Upgrade to wss:// if the page is loaded over HTTPS to prevent Mixed Content errors
      if (window.location.protocol === 'https:' && dynamicWsUrl.startsWith('ws://')) {
        dynamicWsUrl = dynamicWsUrl.replace('ws://', 'wss://');
      }
      
      setWsUrl(dynamicWsUrl);

      // 2. Get token
      const tokenRes = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({ conversationId, endpoint }),
      });
      if (!tokenRes.ok) {
        throw new Error('Failed to fetch LiveKit token');
      }
      const tokenData = await tokenRes.json();
      if (!tokenData.token) {
        throw new Error('No LiveKit token returned from server');
      }
      setToken(tokenData.token);

      setIsCallActive(true);
      setGlobalIsVideoCallActive(true);
    } catch (err) {
      console.error('Failed to start video call', err);
    }
  }, [jwtToken, setGlobalIsVideoCallActive]);

  const endCall = useCallback(() => {
    setIsCallActive(false);
    setGlobalIsVideoCallActive(false);
    setToken(null);
  }, [setGlobalIsVideoCallActive]);

  return { isCallActive, startCall, endCall, token, wsUrl };
}
