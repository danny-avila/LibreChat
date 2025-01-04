import { useEffect } from 'react';
import { EventEmitter } from 'events';
import { useMicVAD } from '@ricky0123/vad-react';
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

export function useVADSetup(webrtcService: WebRTCService | null) {
  const vad = useMicVAD({
    startOnLoad: true,
    onSpeechStart: () => {
      // Only emit speech events if not muted
      if (webrtcService && !webrtcService.isMuted()) {
        webrtcService.handleVADStatusChange(true);
      }
    },
    onSpeechEnd: () => {
      // Only emit speech events if not muted
      if (webrtcService && !webrtcService.isMuted()) {
        webrtcService.handleVADStatusChange(false);
      }
    },
    onVADMisfire: () => {
      if (webrtcService && !webrtcService.isMuted()) {
        webrtcService.handleVADStatusChange(false);
      }
    },
  });

  // Add effect to handle mute state changes
  useEffect(() => {
    if (webrtcService) {
      const handleMuteChange = (muted: boolean) => {
        if (muted) {
          // Stop VAD processing when muted
          vad.pause();
        } else {
          // Resume VAD processing when unmuted
          vad.start();
        }
      };

      webrtcService.on('muteStateChange', handleMuteChange);
      return () => {
        webrtcService.off('muteStateChange', handleMuteChange);
      };
    }
  }, [webrtcService, vad]);

  return vad;
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

  private isUserSpeaking = false;

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

  public handleVADStatusChange(isSpeaking: boolean) {
    if (this.isUserSpeaking !== isSpeaking) {
      this.isUserSpeaking = isSpeaking;
      this.sendMessage({
        type: 'vad-status',
        payload: { speaking: isSpeaking },
      });
      this.emit('vadStatusChange', isSpeaking);
    }
  }

  public setMuted(muted: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        // Stop the track completely when muted instead of just disabling
        if (muted) {
          track.stop();
        } else {
          // If unmuting, we need to get a new audio track
          this.refreshAudioTrack();
        }
      });

      if (muted) {
        // Ensure VAD knows we're not speaking when muted
        this.handleVADStatusChange(false);
      }

      this.emit('muteStateChange', muted);
    }
  }

  public isMuted(): boolean {
    if (!this.localStream) {
      return false;
    }
    const audioTrack = this.localStream.getAudioTracks()[0];
    return audioTrack ? !audioTrack.enabled : false;
  }

  private async refreshAudioTrack() {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const newTrack = newStream.getAudioTracks()[0];
      if (this.localStream && this.peerConnection) {
        const oldTrack = this.localStream.getAudioTracks()[0];
        if (oldTrack) {
          this.localStream.removeTrack(oldTrack);
        }
        this.localStream.addTrack(newTrack);

        // Update the sender with the new track
        const senders = this.peerConnection.getSenders();
        const audioSender = senders.find((sender) => sender.track?.kind === 'audio');
        if (audioSender) {
          audioSender.replaceTrack(newTrack);
        }
      }
    } catch (error) {
      this.handleError(error);
    }
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
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }

        this.remoteStream.addTrack(track);

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
          this.clearConnectionTimeout();
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

    if (this.connectionState !== ConnectionState.CONNECTED) {
      this.setConnectionState(ConnectionState.FAILED);
      this.emit('error', errorMessage);
    }

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
