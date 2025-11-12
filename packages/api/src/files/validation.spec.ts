import { Providers } from '@librechat/agents';
import { mbToBytes } from 'librechat-data-provider';
import { validatePdf, validateVideo, validateAudio } from './validation';

describe('PDF Validation with fileConfig.endpoints.*.fileSizeLimit', () => {
  /** Helper to create a PDF buffer with valid header */
  const createMockPdfBuffer = (sizeInMB: number): Buffer => {
    const bytes = Math.floor(sizeInMB * 1024 * 1024);
    const buffer = Buffer.alloc(bytes);
    buffer.write('%PDF-1.4\n', 0);
    return buffer;
  };

  describe('validatePdf - OpenAI provider', () => {
    const provider = Providers.OPENAI;

    it('should accept PDF within provider limit when no config provided', async () => {
      const pdfBuffer = createMockPdfBuffer(8);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject PDF exceeding provider limit when no config provided', async () => {
      const pdfBuffer = createMockPdfBuffer(12);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('12MB');
      expect(result.error).toContain('10MB');
    });

    it('should use configured limit when it is lower than provider limit', async () => {
      const configuredLimit = 5 * 1024 * 1024; // 5MB
      const pdfBuffer = createMockPdfBuffer(7); // Between configured and provider limit
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider, configuredLimit);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('7MB');
      expect(result.error).toContain('5MB');
    });

    it('should allow configured limit higher than provider default', async () => {
      const configuredLimit = 50 * 1024 * 1024; // 50MB (higher than 10MB provider default)
      const pdfBuffer = createMockPdfBuffer(12); // Between provider default and configured limit
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider, configuredLimit);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept PDF within both configured and provider limits', async () => {
      const configuredLimit = 50 * 1024 * 1024; // 50MB
      const pdfBuffer = createMockPdfBuffer(8);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider, configuredLimit);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept PDF within lower configured limit', async () => {
      const configuredLimit = 5 * 1024 * 1024; // 5MB
      const pdfBuffer = createMockPdfBuffer(4);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider, configuredLimit);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should handle exact limit size correctly', async () => {
      const configuredLimit = 10 * 1024 * 1024; // Exactly 10MB
      const pdfBuffer = Buffer.alloc(10 * 1024 * 1024);
      pdfBuffer.write('%PDF-1.4\n', 0);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider, configuredLimit);

      expect(result.isValid).toBe(true);
    });
  });

  describe('validatePdf - Anthropic provider', () => {
    const provider = Providers.ANTHROPIC;

    it('should accept PDF within provider limit when no config provided', async () => {
      const pdfBuffer = createMockPdfBuffer(20);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject PDF exceeding provider limit when no config provided', async () => {
      const pdfBuffer = createMockPdfBuffer(35);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('35MB');
      expect(result.error).toContain('32MB');
    });

    it('should use configured limit when it is lower than provider limit', async () => {
      const configuredLimit = mbToBytes(15); // 15MB
      const pdfBuffer = createMockPdfBuffer(20); // Between configured and provider limit
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider, configuredLimit);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('20MB');
      expect(result.error).toContain('15MB');
    });

    it('should allow configured limit higher than provider default', async () => {
      const configuredLimit = mbToBytes(50); // 50MB (higher than 32MB provider default)
      const pdfBuffer = createMockPdfBuffer(35); // Between provider default and configured limit
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider, configuredLimit);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject encrypted PDFs regardless of size', async () => {
      const pdfBuffer = Buffer.alloc(1024);
      pdfBuffer.write('%PDF-1.4\n', 0);
      pdfBuffer.write('/Encrypt ', 100);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('encrypted');
    });

    it('should reject PDFs with invalid header', async () => {
      const pdfBuffer = Buffer.alloc(1024);
      pdfBuffer.write('INVALID', 0);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('PDF header');
    });

    it('should reject PDFs that are too small', async () => {
      const pdfBuffer = Buffer.alloc(3);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too small');
    });
  });

  describe('validatePdf - Google provider', () => {
    const provider = Providers.GOOGLE;

    it('should accept PDF within provider limit when no config provided', async () => {
      const pdfBuffer = createMockPdfBuffer(15);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject PDF exceeding provider limit when no config provided', async () => {
      const pdfBuffer = createMockPdfBuffer(25);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('25MB');
      expect(result.error).toContain('20MB');
    });

    it('should use configured limit when it is lower than provider limit', async () => {
      const configuredLimit = 10 * 1024 * 1024; // 10MB
      const pdfBuffer = createMockPdfBuffer(15); // Between configured and provider limit
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider, configuredLimit);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('15MB');
      expect(result.error).toContain('10MB');
    });

    it('should allow configured limit higher than provider default', async () => {
      const configuredLimit = 50 * 1024 * 1024; // 50MB (higher than 20MB provider default)
      const pdfBuffer = createMockPdfBuffer(25); // Between provider default and configured limit
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider, configuredLimit);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('validatePdf - VertexAI provider', () => {
    const provider = Providers.VERTEXAI;

    it('should accept PDF within provider limit', async () => {
      const pdfBuffer = createMockPdfBuffer(15);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider);

      expect(result.isValid).toBe(true);
    });

    it('should respect configured limit', async () => {
      const configuredLimit = 10 * 1024 * 1024;
      const pdfBuffer = createMockPdfBuffer(15);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider, configuredLimit);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('10MB');
    });
  });

  describe('validatePdf - Azure OpenAI provider', () => {
    const provider = Providers.AZURE;

    it('should accept PDF within OpenAI-like provider limit', async () => {
      const pdfBuffer = createMockPdfBuffer(8);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider);

      expect(result.isValid).toBe(true);
    });

    it('should respect configured limit for Azure', async () => {
      const configuredLimit = 5 * 1024 * 1024;
      const pdfBuffer = createMockPdfBuffer(7);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider, configuredLimit);

      expect(result.isValid).toBe(false);
    });
  });

  describe('validatePdf - Unsupported providers', () => {
    it('should return valid for providers without specific validation', async () => {
      const pdfBuffer = createMockPdfBuffer(100); // Very large file
      const provider = 'unsupported' as Providers;
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, provider);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero-configured limit', async () => {
      const configuredLimit = 0;
      const pdfBuffer = createMockPdfBuffer(1);
      const result = await validatePdf(
        pdfBuffer,
        pdfBuffer.length,
        Providers.OPENAI,
        configuredLimit,
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('0MB');
    });

    it('should handle very small PDF files', async () => {
      const pdfBuffer = Buffer.alloc(100);
      pdfBuffer.write('%PDF-1.4\n', 0);
      const result = await validatePdf(
        pdfBuffer,
        pdfBuffer.length,
        Providers.OPENAI,
        10 * 1024 * 1024,
      );

      expect(result.isValid).toBe(true);
    });

    it('should handle configured limit equal to provider limit', async () => {
      const configuredLimit = 10 * 1024 * 1024; // Same as OpenAI provider limit
      const pdfBuffer = createMockPdfBuffer(12);
      const result = await validatePdf(
        pdfBuffer,
        pdfBuffer.length,
        Providers.OPENAI,
        configuredLimit,
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('10MB');
    });

    it('should use provider limit when configured limit is undefined', async () => {
      const pdfBuffer = createMockPdfBuffer(12);
      const result = await validatePdf(pdfBuffer, pdfBuffer.length, Providers.OPENAI, undefined);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('10MB');
    });
  });

  describe('Bug reproduction - Original issue', () => {
    it('should reproduce the original bug scenario from issue description', async () => {
      /**
       * Original bug: User configures openAI.fileSizeLimit = 50MB in librechat.yaml
       * Uploads a 15MB PDF to OpenAI endpoint
       * Expected: Should be accepted (within 50MB config)
       * Actual (before fix): Rejected with "exceeds 10MB limit"
       */
      const configuredLimit = mbToBytes(50); // User configured 50MB
      const pdfBuffer = createMockPdfBuffer(15); // User uploads 15MB file

      const result = await validatePdf(
        pdfBuffer,
        pdfBuffer.length,
        Providers.OPENAI,
        configuredLimit,
      );

      /**
       * After fix: Should be accepted because configured limit (50MB) overrides
       * provider default (10MB), allowing for API changes
       */
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should allow user to set stricter limits than provider', async () => {
      /**
       * Use case: User wants to enforce stricter limits than provider allows
       * User configures openAI.fileSizeLimit = 5MB
       * Uploads a 7MB PDF to OpenAI endpoint
       * Expected: Should be rejected (exceeds 5MB configured limit)
       */
      const configuredLimit = mbToBytes(5); // User configured 5MB
      const pdfBuffer = createMockPdfBuffer(7); // User uploads 7MB file

      const result = await validatePdf(
        pdfBuffer,
        pdfBuffer.length,
        Providers.OPENAI,
        configuredLimit,
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('7MB');
      expect(result.error).toContain('5MB');
    });

    it('should allow upload within stricter user-configured limit', async () => {
      /**
       * User configures openAI.fileSizeLimit = 5MB
       * Uploads a 4MB PDF
       * Expected: Should be accepted
       */
      const configuredLimit = mbToBytes(5);
      const pdfBuffer = createMockPdfBuffer(4);

      const result = await validatePdf(
        pdfBuffer,
        pdfBuffer.length,
        Providers.OPENAI,
        configuredLimit,
      );

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('Video and Audio Validation with fileConfig', () => {
    /** Helper to create a mock video/audio buffer */
    const createMockMediaBuffer = (sizeInMB: number): Buffer => {
      const bytes = Math.floor(sizeInMB * 1024 * 1024);
      return Buffer.alloc(bytes);
    };

    describe('validateVideo - Google provider', () => {
      const provider = Providers.GOOGLE;

      it('should accept video within provider limit when no config provided', async () => {
        const videoBuffer = createMockMediaBuffer(15);
        const result = await validateVideo(videoBuffer, videoBuffer.length, provider);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should reject video exceeding provider limit when no config provided', async () => {
        const videoBuffer = createMockMediaBuffer(25);
        const result = await validateVideo(videoBuffer, videoBuffer.length, provider);

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('25MB');
        expect(result.error).toContain('20MB');
      });

      it('should use configured limit when it is lower than provider limit', async () => {
        const configuredLimit = mbToBytes(10); // 10MB
        const videoBuffer = createMockMediaBuffer(15); // Between configured and provider limit
        const result = await validateVideo(
          videoBuffer,
          videoBuffer.length,
          provider,
          configuredLimit,
        );

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('15MB');
        expect(result.error).toContain('10MB');
      });

      it('should allow configured limit higher than provider default', async () => {
        const configuredLimit = mbToBytes(50); // 50MB (higher than 20MB provider default)
        const videoBuffer = createMockMediaBuffer(25); // Between provider default and configured limit
        const result = await validateVideo(
          videoBuffer,
          videoBuffer.length,
          provider,
          configuredLimit,
        );

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept video within lower configured limit', async () => {
        const configuredLimit = mbToBytes(8);
        const videoBuffer = createMockMediaBuffer(7);
        const result = await validateVideo(
          videoBuffer,
          videoBuffer.length,
          provider,
          configuredLimit,
        );

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should reject videos that are too small', async () => {
        const videoBuffer = Buffer.alloc(5);
        const result = await validateVideo(videoBuffer, videoBuffer.length, provider);

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('too small');
      });
    });

    describe('validateAudio - Google provider', () => {
      const provider = Providers.GOOGLE;

      it('should accept audio within provider limit when no config provided', async () => {
        const audioBuffer = createMockMediaBuffer(15);
        const result = await validateAudio(audioBuffer, audioBuffer.length, provider);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should reject audio exceeding provider limit when no config provided', async () => {
        const audioBuffer = createMockMediaBuffer(25);
        const result = await validateAudio(audioBuffer, audioBuffer.length, provider);

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('25MB');
        expect(result.error).toContain('20MB');
      });

      it('should use configured limit when it is lower than provider limit', async () => {
        const configuredLimit = mbToBytes(10); // 10MB
        const audioBuffer = createMockMediaBuffer(15); // Between configured and provider limit
        const result = await validateAudio(
          audioBuffer,
          audioBuffer.length,
          provider,
          configuredLimit,
        );

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('15MB');
        expect(result.error).toContain('10MB');
      });

      it('should allow configured limit higher than provider default', async () => {
        const configuredLimit = mbToBytes(50); // 50MB (higher than 20MB provider default)
        const audioBuffer = createMockMediaBuffer(25); // Between provider default and configured limit
        const result = await validateAudio(
          audioBuffer,
          audioBuffer.length,
          provider,
          configuredLimit,
        );

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept audio within lower configured limit', async () => {
        const configuredLimit = mbToBytes(8);
        const audioBuffer = createMockMediaBuffer(7);
        const result = await validateAudio(
          audioBuffer,
          audioBuffer.length,
          provider,
          configuredLimit,
        );

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should reject audio files that are too small', async () => {
        const audioBuffer = Buffer.alloc(5);
        const result = await validateAudio(audioBuffer, audioBuffer.length, provider);

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('too small');
      });
    });

    describe('validateVideo and validateAudio - VertexAI provider', () => {
      const provider = Providers.VERTEXAI;

      it('should respect configured video limit for VertexAI', async () => {
        const configuredLimit = mbToBytes(10);
        const videoBuffer = createMockMediaBuffer(15);
        const result = await validateVideo(
          videoBuffer,
          videoBuffer.length,
          provider,
          configuredLimit,
        );

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('10MB');
      });

      it('should respect configured audio limit for VertexAI', async () => {
        const configuredLimit = mbToBytes(10);
        const audioBuffer = createMockMediaBuffer(15);
        const result = await validateAudio(
          audioBuffer,
          audioBuffer.length,
          provider,
          configuredLimit,
        );

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('10MB');
      });
    });

    describe('validateVideo and validateAudio - Unsupported providers', () => {
      it('should return valid for video from unsupported provider', async () => {
        const videoBuffer = createMockMediaBuffer(100);
        const provider = Providers.OPENAI;
        const result = await validateVideo(videoBuffer, videoBuffer.length, provider);

        expect(result.isValid).toBe(true);
      });

      it('should return valid for audio from unsupported provider', async () => {
        const audioBuffer = createMockMediaBuffer(100);
        const provider = Providers.OPENAI;
        const result = await validateAudio(audioBuffer, audioBuffer.length, provider);

        expect(result.isValid).toBe(true);
      });
    });
  });
});
