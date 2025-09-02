const { Readable } = require('stream');
const { logger } = require('~/config');

class TextStream extends Readable {
  constructor(text, options = {}) {
    super(options);
    this.text = text;
    this.currentIndex = 0;
    this.minChunkSize = options.minChunkSize ?? 2;
    this.maxChunkSize = options.maxChunkSize ?? 4;
    this.delay = options.delay ?? 20; // Time in milliseconds
  }

  _read() {
    const { delay, minChunkSize, maxChunkSize } = this;

    if (this.currentIndex < this.text.length) {
      setTimeout(() => {
        const remainingChars = this.text.length - this.currentIndex;
        const chunkSize = Math.min(this.randomInt(minChunkSize, maxChunkSize + 1), remainingChars);

        const chunk = this.text.slice(this.currentIndex, this.currentIndex + chunkSize);
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
        onProgressCallback(chunk.toString());
      });

      this.on('end', () => {
        // logger.debug('[processTextStream] Stream ended');
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
      // Handle the error appropriately, e.g., return an error message or throw an error
    }
  }
}

module.exports = TextStream;
