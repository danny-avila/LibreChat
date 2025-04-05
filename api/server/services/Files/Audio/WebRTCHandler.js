const { RTCPeerConnection, RTCIceCandidate, MediaStream } = require('wrtc');
const { logger } = require('~/config');

class WebRTCConnection {
  constructor(socket, config) {
    this.socket = socket;
    this.config = config;
    this.peerConnection = null;
    this.audioTransceiver = null;
    this.pendingCandidates = [];
    this.state = 'idle';
  }

  async handleOffer(offer) {
    try {
      if (!this.peerConnection) {
        this.peerConnection = new RTCPeerConnection(this.config.rtcConfig);
        this.setupPeerConnectionListeners();
      }

      await this.peerConnection.setRemoteDescription(offer);

      const mediaStream = new MediaStream();

      this.audioTransceiver = this.peerConnection.addTransceiver('audio', {
        direction: 'sendrecv',
        streams: [mediaStream],
      });

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      this.socket.emit('webrtc-answer', answer);
    } catch (error) {
      logger.error(`Error handling offer: ${error}`);
      this.socket.emit('webrtc-error', {
        message: error.message,
        code: 'OFFER_ERROR',
      });
    }
  }

  setupPeerConnectionListeners() {
    if (!this.peerConnection) {
      return;
    }

    this.peerConnection.ontrack = ({ track }) => {
      logger.info(`Received ${track.kind} track from client`);

      if (track.kind === 'audio') {
        this.handleIncomingAudio(track);
      }

      track.onended = () => {
        logger.info(`${track.kind} track ended`);
      };
    };

    this.peerConnection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.socket.emit('icecandidate', candidate);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (!this.peerConnection) {
        return;
      }

      const state = this.peerConnection.connectionState;
      logger.info(`Connection state changed to ${state}`);
      this.state = state;

      if (state === 'failed' || state === 'closed') {
        this.cleanup();
      }
    };
  }

  handleIncomingAudio(track) {
    if (this.peerConnection) {
      const stream = new MediaStream([track]);
      this.peerConnection.addTrack(track, stream);
    }
  }

  async addIceCandidate(candidate) {
    try {
      if (this.peerConnection?.remoteDescription) {
        if (candidate && candidate.candidate) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          logger.warn('Invalid ICE candidate');
        }
      } else {
        this.pendingCandidates.push(candidate);
      }
    } catch (error) {
      logger.error(`Error adding ICE candidate: ${error}`);
    }
  }

  cleanup() {
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (error) {
        logger.error(`Error closing peer connection: ${error}`);
      }
      this.peerConnection = null;
    }

    this.audioTransceiver = null;
    this.pendingCandidates = [];
    this.state = 'idle';
  }
}

class AudioHandler {
  constructor() {
    this.connections = new Map();
    this.defaultRTCConfig = {
      iceServers: [
        {
          urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
        },
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    };
  }

  registerSocketHandlers(socket) {
    const rtcConfig = {
      rtcConfig: this.defaultRTCConfig,
    };

    const rtcConnection = new WebRTCConnection(socket, rtcConfig);
    this.connections.set(socket.id, rtcConnection);

    socket.on('webrtc-offer', (offer) => {
      logger.debug(`Received WebRTC offer from ${socket.id}`);
      rtcConnection.handleOffer(offer);
    });

    socket.on('icecandidate', (candidate) => {
      rtcConnection.addIceCandidate(candidate);
    });

    socket.on('vad-status', (status) => {
      logger.debug(`VAD status from ${socket.id}: ${JSON.stringify(status)}`);
    });

    socket.on('disconnect', () => {
      rtcConnection.cleanup();
      this.connections.delete(socket.id);
    });

    return rtcConnection;
  }

  cleanup(socketId) {
    const connection = this.connections.get(socketId);
    if (connection) {
      connection.cleanup();
      this.connections.delete(socketId);
    }
  }

  cleanupAll() {
    for (const connection of this.connections.values()) {
      connection.cleanup();
    }
    this.connections.clear();
  }
}

module.exports = { AudioHandler, WebRTCConnection };
