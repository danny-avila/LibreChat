import { EventEmitter } from 'events';
import type { MessagePayload } from '~/common';

export enum ConnectionState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
  CLOSED = 'closed',
}

export enum MediaState {
  INACTIVE = 'inactive',
  PENDING = 'pending',
  ACTIVE = 'active',
  FAILED = 'failed',
}

interface WebRTCConfig {
  iceServers?: RTCIceServer[];
  maxReconnectAttempts?: number;
  connectionTimeout?: number;
  debug?: boolean;
}

export class WebRTCService extends EventEmitter {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private reconnectAttempts = 0;
  private connectionTimeoutId: NodeJS.Timeout | null = null;
  private config: Required<WebRTCConfig>;
  private connectionState: ConnectionState = ConnectionState.IDLE;
  private mediaState: MediaState = MediaState.INACTIVE;

  private readonly DEFAULT_CONFIG: Required<WebRTCConfig> = {
    iceServers: [
      {
        urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
      },
    ],
    maxReconnectAttempts: 3,
    connectionTimeout: 30000,
    debug: false,
  };

  constructor(
    private readonly sendMessage: (message: { type: string; payload?: MessagePayload }) => boolean,
    config: WebRTCConfig = {},
  ) {
    super();
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    this.log('WebRTCService initialized with config:', this.config);
  }

  private log(...args: unknown[]) {
    if (this.config.debug) {
      console.log('[WebRTC]', ...args);
    }
  }

  private setConnectionState(state: ConnectionState) {
    this.connectionState = state;
    this.emit('connectionStateChange', state);
    this.log('Connection state changed to:', state);
  }

  private setMediaState(state: MediaState) {
    this.mediaState = state;
    this.emit('mediaStateChange', state);
    this.log('Media state changed to:', state);
  }

  async initialize() {
    try {
      this.setConnectionState(ConnectionState.CONNECTING);
      this.setMediaState(MediaState.PENDING);

      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.peerConnection = new RTCPeerConnection({
        iceServers: this.config.iceServers,
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      });

      this.setupPeerConnectionListeners();

      this.localStream.getTracks().forEach((track) => {
        if (this.localStream && this.peerConnection) {
          this.peerConnection.addTrack(track, this.localStream);
        }
      });

      this.startConnectionTimeout();

      await this.createAndSendOffer();

      this.setMediaState(MediaState.ACTIVE);
    } catch (error) {
      this.log('Initialization error:', error);
      this.handleError(error);
    }
  }

  private sendSignalingMessage(message: { type: string; payload?: MessagePayload }) {
    const sent = this.sendMessage(message);
    if (!sent) {
      this.handleError(new Error('Failed to send signaling message - WebSocket not connected'));
    }
  }

  private setupPeerConnectionListeners() {
    if (!this.peerConnection) {
      return;
    }

    this.peerConnection.ontrack = ({ track, streams }) => {
      this.log('Track received:', {
        kind: track.kind,
        enabled: track.enabled,
        readyState: track.readyState,
      });

      if (track.kind === 'audio') {
        // Create remote stream if needed
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }

        // Add incoming track to remote stream
        this.remoteStream.addTrack(track);

        // Echo back the track
        if (this.peerConnection) {
          this.peerConnection.addTrack(track, this.remoteStream);
        }

        this.log('Audio track added to remote stream', {
          tracks: this.remoteStream.getTracks().length,
          active: this.remoteStream.active,
        });

        this.emit('remoteStream', this.remoteStream);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (!this.peerConnection) {
        return;
      }

      const state = this.peerConnection.connectionState;
      this.log('Connection state changed:', state);

      switch (state) {
        case 'connected':
          this.clearConnectionTimeout(); // Clear timeout when connected
          this.setConnectionState(ConnectionState.CONNECTED);
          break;
        case 'disconnected':
        case 'failed':
          if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this.attemptReconnection();
          } else {
            this.handleError(new Error('Connection failed after max reconnection attempts'));
          }
          break;
        case 'closed':
          this.setConnectionState(ConnectionState.CLOSED);
          break;
      }
    };
  }

  private async createAndSendOffer() {
    if (!this.peerConnection) {
      return;
    }

    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
      });

      await this.peerConnection.setLocalDescription(offer);

      this.sendSignalingMessage({
        type: 'webrtc-offer',
        payload: offer,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  public async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.peerConnection) {
      return;
    }

    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      this.log('Remote description set successfully');
    } catch (error) {
      this.handleError(error);
    }
  }

  public async addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.peerConnection?.remoteDescription) {
      this.log('Delaying ICE candidate addition - no remote description');
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      this.log('ICE candidate added successfully');
    } catch (error) {
      this.handleError(error);
    }
  }

  private startConnectionTimeout() {
    this.clearConnectionTimeout();
    this.connectionTimeoutId = setTimeout(() => {
      // Only timeout if we're not in a connected or connecting state
      if (
        this.connectionState !== ConnectionState.CONNECTED &&
        this.connectionState !== ConnectionState.CONNECTING
      ) {
        this.handleError(new Error('Connection timeout'));
      }
    }, this.config.connectionTimeout);
  }

  private clearConnectionTimeout() {
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
  }

  private async attemptReconnection() {
    this.reconnectAttempts++;
    this.log(
      `Attempting reconnection (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`,
    );

    this.setConnectionState(ConnectionState.RECONNECTING);
    this.emit('reconnecting', this.reconnectAttempts);

    try {
      if (this.peerConnection) {
        const offer = await this.peerConnection.createOffer({ iceRestart: true });
        await this.peerConnection.setLocalDescription(offer);
        this.sendSignalingMessage({
          type: 'webrtc-offer',
          payload: offer,
        });
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: Error | unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    this.log('Error:', errorMessage);

    // Don't set failed state if we're already connected
    if (this.connectionState !== ConnectionState.CONNECTED) {
      this.setConnectionState(ConnectionState.FAILED);
      this.emit('error', errorMessage);
    }

    // Only close if we're not connected
    if (this.connectionState !== ConnectionState.CONNECTED) {
      this.close();
    }
  }

  public close() {
    this.clearConnectionTimeout();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.setConnectionState(ConnectionState.CLOSED);
    this.setMediaState(MediaState.INACTIVE);
  }

  public getStats(): Promise<RTCStatsReport> | null {
    return this.peerConnection?.getStats() ?? null;
  }
}
