import { useEffect, useRef, useState, useCallback } from 'react';
import { useGetWebsocketUrlQuery } from 'librechat-data-provider/react-query';
import { io, Socket } from 'socket.io-client';
import type { RTCMessage } from '~/common';

const useWebSocket = () => {
  const { data } = useGetWebsocketUrlQuery();
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const connect = useCallback(() => {
    if (!data || !data.url) {
      return;
    }

    socketRef.current = io(data.url, { transports: ['websocket'] });

    socketRef.current.on('connect', () => {
      setIsConnected(true);
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
    });

    socketRef.current.on('error', (err) => {
      console.error('Socket.IO error:', err);
    });

    socketRef.current.on('transcription', (msg: RTCMessage) => {
      // TODO: Handle transcription update
    });

    socketRef.current.on('llm-response', (msg: RTCMessage) => {
      // TODO: Handle LLM streaming response
    });

    socketRef.current.on('tts-chunk', (msg: RTCMessage) => {
      if (typeof msg.data === 'string') {
        const audio = new Audio(`data:audio/mp3;base64,${msg.data}`);
        audio.play().catch(console.error);
      }
    });
  }, [data?.url]);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.disconnect();
    };
  }, [connect]);

  const sendMessage = useCallback((message: Record<string, unknown>) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('message', message);
    }
  }, []);

  return { isConnected, sendMessage };
};

export default useWebSocket;
