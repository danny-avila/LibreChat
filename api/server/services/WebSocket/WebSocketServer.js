const { WebSocketServer } = require('ws');
const { RTCPeerConnection } = require('wrtc');

module.exports.WebSocketService = class {
  constructor(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.log('Server initialized');
    this.activeClients = new Map();
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];
    this.setupHandlers();
  }

  log(msg) {
    console.log(`[WSS ${new Date().toISOString()}] ${msg}`);
  }

  setupHandlers() {
    this.wss.on('connection', (ws) => {
      const clientId = Date.now().toString();
      this.activeClients.set(clientId, {
        ws,
        state: 'idle',
        audioBuffer: [],
        currentTranscription: '',
        isProcessing: false,
      });

      this.log(`Client connected: ${clientId}`);

      ws.on('message', async (raw) => {
        let message;
        try {
          message = JSON.parse(raw);
        } catch {
          return;
        }

        switch (message.type) {
          case 'call-start':
            this.handleCallStart(clientId);
            break;

          case 'audio-chunk':
            await this.handleAudioChunk(clientId, message.data);
            break;

          case 'processing-start':
            await this.processAudioStream(clientId);
            break;

          case 'audio-received':
            this.confirmAudioReceived(clientId);
            break;

          case 'call-ended':
            this.handleCallEnd(clientId);
            break;
        }
      });

      ws.on('close', () => {
        this.handleCallEnd(clientId);
        this.activeClients.delete(clientId);
        this.log(`Client disconnected: ${clientId}`);
      });

      ws.on('error', (error) => {
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
          client.ws.send(
            JSON.stringify({
              type: 'ice-candidate',
              candidate: event.candidate,
            }),
          );
        }
      };

      peerConnection.onnegotiationneeded = async () => {
        try {
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          client.ws.send(
            JSON.stringify({
              type: 'webrtc-offer',
              sdp: peerConnection.localDescription,
            }),
          );
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
    client.ws.send(JSON.stringify({ type: 'audio-received' }));
  }

  async processAudioStream(clientId) {
    const client = this.activeClients.get(clientId);
    if (!client || client.state !== 'active' || client.isProcessing) {
      return;
    }

    client.isProcessing = true;

    try {
      // Process transcription
      client.ws.send(
        JSON.stringify({
          type: 'transcription',
          data: 'Processing audio...',
        }),
      );

      // Stream LLM response
      client.ws.send(
        JSON.stringify({
          type: 'llm-response',
          data: 'Processing response...',
        }),
      );

      // Stream TTS chunks
      client.ws.send(
        JSON.stringify({
          type: 'tts-chunk',
          data: 'audio_data_here',
        }),
      );
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

    client.ws.send(
      JSON.stringify({
        type: 'audio-received',
        data: null,
      }),
    );
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
