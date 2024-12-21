const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');

module.exports.WebSocketService = class {
  constructor(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.log('Server initialized');
    this.clientAudioBuffers = new Map();
    this.setupHandlers();
  }

  log(msg) {
    console.log(`[WSS ${new Date().toISOString()}] ${msg}`);
  }

  setupHandlers() {
    this.wss.on('connection', (ws) => {
      const clientId = Date.now().toString();
      this.clientAudioBuffers.set(clientId, []);

      this.log(`Client connected: ${clientId}`);

      ws.on('message', async (raw) => {
        let message;
        try {
          message = JSON.parse(raw);
        } catch {
          return;
        }

        if (message.type === 'audio-chunk') {
          if (!this.clientAudioBuffers.has(clientId)) {
            this.clientAudioBuffers.set(clientId, []);
          }
          this.clientAudioBuffers.get(clientId).push(message.data);
        }

        if (message.type === 'request-response') {
          const filePath = path.join(__dirname, './assets/response.mp3');
          const audioFile = fs.readFileSync(filePath);
          ws.send(JSON.stringify({ type: 'audio-response', data: audioFile.toString('base64') }));
        }

        if (message.type === 'call-ended') {
          const allChunks = this.clientAudioBuffers.get(clientId);
          this.writeAudioFile(clientId, allChunks);
          this.clientAudioBuffers.delete(clientId);
        }
      });

      ws.on('close', () => {
        this.log(`Client disconnected: ${clientId}`);
        this.clientAudioBuffers.delete(clientId);
      });
    });
  }

  writeAudioFile(clientId, base64Chunks) {
    if (!base64Chunks || base64Chunks.length === 0) {
      return;
    }
    const filePath = path.join(__dirname, `recorded_${clientId}.webm`);
    const buffer = Buffer.concat(
      base64Chunks.map((chunk) => Buffer.from(chunk.split(',')[1], 'base64')),
    );
    fs.writeFileSync(filePath, buffer);
    this.log(`Saved audio to ${filePath}`);
  }
};
