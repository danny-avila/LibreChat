import type { RTCMessage } from '~/common';
export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private onMessage: (msg: RTCMessage) => void;

  constructor(onMessage: (msg: RTCMessage) => void) {
    this.onMessage = onMessage;
  }

  async initializeCall() {
    this.peerConnection = new RTCPeerConnection();
    this.dataChannel = this.peerConnection.createDataChannel('audio');

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(stream);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0 && this.dataChannel?.readyState === 'open') {
        e.data.arrayBuffer().then((buffer) => {
          this.dataChannel?.send(buffer);
        });
      }
    };

    this.mediaRecorder.start(100);
    this.setupDataChannel();
  }

  private setupDataChannel() {
    if (!this.dataChannel) {
      return;
    }

    this.dataChannel.onmessage = (event) => {
      this.onMessage({
        type: 'audio-chunk',
        data: event.data,
      });
    };
  }

  public async sendAudioChunk(audioBlob: Blob) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(await audioBlob.arrayBuffer());
    }
  }

  async endCall() {
    this.mediaRecorder?.stop();
    this.dataChannel?.close();
    this.peerConnection?.close();
  }
}
