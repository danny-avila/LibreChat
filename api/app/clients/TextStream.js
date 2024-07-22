const { Readable } = require('stream');
const { logger } = require('~/config');

class TextStream extends Readable {
  constructor(text, options = {}) {
    super(options);
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder('utf-8', { stream: true });
    this.bytes = this.encoder.encode(text);
    this.currentIndex = 0;
    this.minChunkSize = options.minChunkSize ?? 2;
    this.maxChunkSize = options.maxChunkSize ?? 4;
    this.delay = options.delay ?? 20; // Time in milliseconds
  }

  _read() {
    const { delay, minChunkSize, maxChunkSize } = this;

    if (this.currentIndex < this.bytes.length) {
      setTimeout(() => {
        const remainingBytes = this.bytes.length - this.currentIndex;
        const chunkSize = Math.min(this.randomInt(minChunkSize, maxChunkSize + 1), remainingBytes);

        const chunk = this.bytes.slice(this.currentIndex, this.currentIndex + chunkSize);
        this.push(chunk);
        this.currentIndex += chunkSize;
      }, delay);
    } else {
      this.push(null); // signal end of data
    }
  }

  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
  }

  async processTextStream(onProgressCallback) {
    const streamPromise = new Promise((resolve, reject) => {
      this.on('data', (chunk) => {
        const decodedChunk = this.decoder.decode(chunk, { stream: true });
        onProgressCallback(decodedChunk);
      });

      this.on('end', () => {
        const finalChunk = this.decoder.decode(); // Flush the decoder
        if (finalChunk) {
          onProgressCallback(finalChunk);
        }
        resolve();
      });

      this.on('error', (err) => {
        reject(err);
      });
    });

    try {
      await streamPromise;
    } catch (err) {
      logger.error('[processTextStream] Error in text stream:', err);
      // Handle the error appropriately
    }
  }
}

module.exports = TextStream;
