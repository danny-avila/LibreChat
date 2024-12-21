import { useEffect, useRef, useState, useCallback } from 'react';
import { useGetWebsocketUrlQuery } from 'librechat-data-provider/react-query';
import type { RTCMessage } from '~/common';

const useWebSocket = () => {
  const { data: data } = useGetWebsocketUrlQuery();
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!data || !data.url) {
      return;
    }

    wsRef.current = new WebSocket(data.url);
    wsRef.current.onopen = () => setIsConnected(true);
    wsRef.current.onclose = () => setIsConnected(false);
    wsRef.current.onerror = (err) => console.error('WebSocket error:', err);

    wsRef.current.onmessage = (event) => {
      const msg: RTCMessage = JSON.parse(event.data);
      switch (msg.type) {
        case 'transcription':
          // TODO: Handle transcription update
          break;
        case 'llm-response':
          // TODO: Handle LLM streaming response
          break;
        case 'tts-chunk':
          if (typeof msg.data === 'string') {
            const audio = new Audio(`data:audio/mp3;base64,${msg.data}`);
            audio.play().catch(console.error);
          }
          break;
      }
    };
  }, [data?.url]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const sendMessage = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { isConnected, sendMessage };
};

export default useWebSocket;
