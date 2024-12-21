import { useEffect, useRef, useState, useCallback } from 'react';
import { useGetWebsocketUrlQuery } from 'librechat-data-provider/react-query';

const useWebSocket = () => {
  const { data: url } = useGetWebsocketUrlQuery();
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  console.log('wsConfig:', url?.url);

  const connect = useCallback(() => {
    if (!url?.url) {
      return;
    }

    wsRef.current = new WebSocket(url?.url);
    wsRef.current.onopen = () => setIsConnected(true);
    wsRef.current.onclose = () => setIsConnected(false);
    wsRef.current.onerror = (err) => console.error('WebSocket error:', err);

    wsRef.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'audio-response') {
        const audioData = msg.data;
        const audio = new Audio(`data:audio/mp3;base64,${audioData}`);
        audio.play().catch(console.error);
      }
    };
  }, [url?.url]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { isConnected, sendMessage };
};

export default useWebSocket;
