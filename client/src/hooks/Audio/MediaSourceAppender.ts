export class MediaSourceAppender {
  private readonly mediaSource = new MediaSource();
  private readonly audioChunks: ArrayBuffer[] = [];

  private sourceBuffer?: SourceBuffer;

  constructor(type: string) {
    this.mediaSource.addEventListener('sourceopen', async () => {
      this.sourceBuffer = this.mediaSource.addSourceBuffer(type);

      this.sourceBuffer.addEventListener('updateend', () => {
        this.tryAppendNextChunk();
      });
    });
  }

  private tryAppendNextChunk() {
    if (this.sourceBuffer != null && !this.sourceBuffer.updating && this.audioChunks.length > 0) {
      this.sourceBuffer.appendBuffer(this.audioChunks.shift()!);
    }
  }

  public addBase64Data(base64Data: string) {
    this.addData(Uint8Array.from(atob(base64Data), (char) => char.charCodeAt(0)).buffer);
  }

  public addData(data: ArrayBuffer) {
    this.audioChunks.push(data);
    this.tryAppendNextChunk();
  }

  public close() {
    if (this.mediaSource.readyState === 'open') {
      this.mediaSource.endOfStream();
    }
  }

  public get mediaSourceUrl() {
    return URL.createObjectURL(this.mediaSource);
  }
}
