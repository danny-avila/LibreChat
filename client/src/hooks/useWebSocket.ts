import { useEffect, useRef, useState } from 'react';
import { useGetWebsocketUrlQuery } from 'librechat-data-provider/react-query';
import type { MessagePayload } from '~/common';
import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';

export const WebSocketEvents = {
  CALL_STARTED: 'call-started',
  CALL_ERROR: 'call-error',
  WEBRTC_ANSWER: 'webrtc-answer',
  ICE_CANDIDATE: 'icecandidate',
} as const;

type EventHandler = (...args: unknown[]) => void;

class WebSocketManager extends EventEmitter {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private isConnected = false;

  connect(url: string) {
    if (this.socket && this.socket.connected) {
      return;
    }
    this.socket = io(url, {
      transports: ['websocket'],
      reconnectionAttempts: this.MAX_RECONNECT_ATTEMPTS,
      timeout: 10000,
    });
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    if (!this.socket) {
      return;
    }

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connectionChange', true);
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      this.emit('connectionChange', false);
    });

    this.socket.on('connect_error', (error) => {
      this.reconnectAttempts++;
      this.emit('connectionChange', false);
      if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
        this.emit('error', 'Failed to connect after maximum attempts');
        this.disconnect();
      }
    });

    // WebRTC signals
    this.socket.on(WebSocketEvents.CALL_STARTED, () => {
      this.emit(WebSocketEvents.CALL_STARTED);
    });

    this.socket.on(WebSocketEvents.WEBRTC_ANSWER, (answer) => {
      this.emit(WebSocketEvents.WEBRTC_ANSWER, answer);
    });

    this.socket.on(WebSocketEvents.ICE_CANDIDATE, (candidate) => {
      this.emit(WebSocketEvents.ICE_CANDIDATE, candidate);
    });

    this.socket.on('error', (error) => {
      this.emit('error', error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
  }

  sendMessage(type: string, payload?: MessagePayload) {
    if (!this.socket || !this.socket.connected) {
      return false;
    }
    this.socket.emit(type, payload);
    return true;
  }

  getConnectionState() {
    return this.isConnected;
  }
}

export const webSocketManager = new WebSocketManager();

const useWebSocket = () => {
  const { data: wsConfig } = useGetWebsocketUrlQuery();
  const [isConnected, setIsConnected] = useState(false);
  const eventHandlersRef = useRef<Record<string, EventHandler>>({});

  useEffect(() => {
    if (wsConfig?.url && !webSocketManager.getConnectionState()) {
      webSocketManager.connect(wsConfig.url);

      const handleConnectionChange = (connected: boolean) => setIsConnected(connected);
      webSocketManager.on('connectionChange', handleConnectionChange);
      webSocketManager.on('error', console.error);

      return () => {
        webSocketManager.off('connectionChange', handleConnectionChange);
        webSocketManager.off('error', console.error);
      };
    }
  }, [wsConfig, wsConfig?.url]);

  const sendMessage = (message: { type: string; payload?: MessagePayload }) => {
    return webSocketManager.sendMessage(message.type, message.payload);
  };

  const addEventListener = (event: string, handler: EventHandler) => {
    eventHandlersRef.current[event] = handler;
    webSocketManager.on(event, handler);
    return () => {
      webSocketManager.off(event, handler);
      delete eventHandlersRef.current[event];
    };
  };

  return {
    isConnected,
    sendMessage,
    addEventListener,
  };
};

export default useWebSocket;
