const { Server } = require('socket.io');
const { RTCPeerConnection, RTCIceCandidate, MediaStream } = require('wrtc');

class WebRTCConnection {
  constructor(socket, config) {
    this.socket = socket;
    this.config = config;
    this.peerConnection = null;
    this.audioTransceiver = null;
    this.pendingCandidates = [];
    this.state = 'idle';
    this.log = config.log || console.log;
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
      this.log(`Error handling offer: ${error}`, 'error');
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
      this.log(`Received ${track.kind} track from client`);

      if (track.kind === 'audio') {
        this.handleIncomingAudio(track);
      }

      track.onended = () => {
        this.log(`${track.kind} track ended`);
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
      this.log(`Connection state changed to ${state}`);
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
          this.log('Invalid ICE candidate', 'warn');
        }
      } else {
        this.pendingCandidates.push(candidate);
      }
    } catch (error) {
      this.log(`Error adding ICE candidate: ${error}`, 'error');
    }
  }

  cleanup() {
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (error) {
        this.log(`Error closing peer connection: ${error}`, 'error');
      }
      this.peerConnection = null;
    }

    this.audioTransceiver = null;
    this.pendingCandidates = [];
    this.state = 'idle';
  }
}

class SocketIOService {
  constructor(httpServer, config = {}) {
    this.config = {
      rtcConfig: {
        iceServers: [
          {
            urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
          },
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      },
      ...config,
    };

    this.io = new Server(httpServer, {
      path: '/socket.io',
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.connections = new Map();
    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      this.log(`Client connected: ${socket.id}`);

      const rtcConnection = new WebRTCConnection(socket, {
        ...this.config,
        log: this.log.bind(this),
      });
      this.connections.set(socket.id, rtcConnection);

      socket.on('webrtc-offer', (offer) => {
        this.log(`Received WebRTC offer from ${socket.id}`);
        rtcConnection.handleOffer(offer);
      });

      socket.on('icecandidate', (candidate) => {
        rtcConnection.addIceCandidate(candidate);
      });

      socket.on('vad-status', (status) => {
        this.log(`VAD status from ${socket.id}: ${JSON.stringify(status)}`);
      });

      socket.on('disconnect', () => {
        this.log(`Client disconnected: ${socket.id}`);
        rtcConnection.cleanup();
        this.connections.delete(socket.id);
      });
    });
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    console.log(`[WebRTC ${timestamp}] [${level.toUpperCase()}] ${message}`);
  }

  shutdown() {
    for (const connection of this.connections.values()) {
      connection.cleanup();
    }
    this.connections.clear();
    this.io.close();
  }
}

module.exports = { SocketIOService };
