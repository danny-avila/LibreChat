const { Server } = require('socket.io');
const { RTCPeerConnection } = require('wrtc');

module.exports.SocketIOService = class {
  constructor(httpServer) {
    this.io = new Server(httpServer, { path: '/socket.io' });
    this.log('Socket.IO Server initialized');
    this.activeClients = new Map();
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];
    this.setupHandlers();
  }

  log(msg) {
    console.log(`[Socket.IO ${new Date().toISOString()}] ${msg}`);
  }

  setupHandlers() {
    this.io.on('connection', (socket) => {
      const clientId = socket.id;
      this.activeClients.set(clientId, {
        socket,
        state: 'idle',
        audioBuffer: [],
        currentTranscription: '',
        isProcessing: false,
      });

      this.log(`Client connected: ${clientId}`);

      socket.on('call-start', () => this.handleCallStart(clientId));
      socket.on('audio-chunk', (data) => this.handleAudioChunk(clientId, data));
      socket.on('processing-start', () => this.processAudioStream(clientId));
      socket.on('audio-received', () => this.confirmAudioReceived(clientId));
      socket.on('call-ended', () => this.handleCallEnd(clientId));

      socket.on('disconnect', () => {
        this.handleCallEnd(clientId);
        this.activeClients.delete(clientId);
        this.log(`Client disconnected: ${clientId}`);
      });

      socket.on('error', (error) => {
        this.log(`Error for client ${clientId}: ${error.message}`);
        this.handleCallEnd(clientId);
      });
    });
  }

  async handleCallStart(clientId) {
    const client = this.activeClients.get(clientId);
    if (!client) {
      return;
    }

    try {
      client.state = 'active';
      client.audioBuffer = [];
      client.currentTranscription = '';
      client.isProcessing = false;

      const peerConnection = new RTCPeerConnection({
        iceServers: this.iceServers,
        sdpSemantics: 'unified-plan',
      });

      client.peerConnection = peerConnection;
      client.dataChannel = peerConnection.createDataChannel('audio', {
        ordered: true,
        maxRetransmits: 3,
      });

      client.dataChannel.onopen = () => this.log(`Data channel opened for ${clientId}`);
      client.dataChannel.onmessage = async (event) => {
        await this.handleAudioChunk(clientId, event.data);
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          client.socket.emit('ice-candidate', { candidate: event.candidate });
        }
      };

      peerConnection.onnegotiationneeded = async () => {
        try {
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          client.socket.emit('webrtc-offer', { sdp: peerConnection.localDescription });
        } catch (error) {
          this.log(`Negotiation failed for ${clientId}: ${error}`);
        }
      };

      this.log(`Call started for client ${clientId}`);
    } catch (error) {
      this.log(`Error starting call for ${clientId}: ${error.message}`);
      this.handleCallEnd(clientId);
    }
  }

  async handleAudioChunk(clientId, data) {
    const client = this.activeClients.get(clientId);
    if (!client || client.state !== 'active') {
      return;
    }

    client.audioBuffer.push(data);
    client.socket.emit('audio-received');
  }

  async processAudioStream(clientId) {
    const client = this.activeClients.get(clientId);
    if (!client || client.state !== 'active' || client.isProcessing) {
      return;
    }

    client.isProcessing = true;

    try {
      // Process transcription
      client.socket.emit('transcription', { data: 'Processing audio...' });

      // Stream LLM response
      client.socket.emit('llm-response', { data: 'Processing response...' });

      // Stream TTS chunks
      client.socket.emit('tts-chunk', { data: 'audio_data_here' });
    } catch (error) {
      this.log(`Processing error for client ${clientId}: ${error.message}`);
    } finally {
      client.isProcessing = false;
      client.audioBuffer = [];
    }
  }

  confirmAudioReceived(clientId) {
    const client = this.activeClients.get(clientId);
    if (!client) {
      return;
    }

    client.socket.emit('audio-received', { data: null });
  }

  handleCallEnd(clientId) {
    const client = this.activeClients.get(clientId);
    if (!client) {
      return;
    }

    client.state = 'idle';
    client.audioBuffer = [];
    client.currentTranscription = '';
  }
};
