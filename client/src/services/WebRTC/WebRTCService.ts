export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private sendMessage: (msg: any) => void;

  constructor(sendMessage: (msg: any) => void) {
    this.sendMessage = sendMessage;
  }

  async initializeCall() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.peerConnection = new RTCPeerConnection();
    stream.getTracks().forEach((track) => this.peerConnection?.addTrack(track, stream));

    this.mediaRecorder = new MediaRecorder(stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        const reader = new FileReader();
        reader.onload = () => {
          this.sendMessage({
            type: 'audio-chunk',
            data: reader.result,
          });
        };
        reader.readAsDataURL(e.data);
      }
    };
    this.mediaRecorder.start();
  }

  async endCall() {
    this.mediaRecorder?.stop();
    this.peerConnection?.close();
    this.peerConnection = null;
  }
}
