jest.setTimeout(120000);
require('dotenv').config();

const GoogleClient = require('../GoogleClient');

describe('Integration latency (real API, Gemini 2.5 Flash)', () => {
  const run = process.env.RUN_GEMINI_BENCH === '1' && !!process.env.GOOGLE_API_KEY;
  const prompt = 'Summarize the key points of the HTTP/2 protocol in 5 bullet points.';
  const simpleContents = [{ role: 'user', parts: [{ text: prompt }] }];

  (run ? test : test.skip)(
    'compare with vs without thinkingBudget=0',
    async () => {
      const ac1 = new AbortController();
      const ac2 = new AbortController();
      try {
        // With thinkingBudget=0 (applied in GoogleClient for flash)
        const client = new GoogleClient(
          { GOOGLE_API_KEY: process.env.GOOGLE_API_KEY },
          { modelOptions: { model: 'gemini-2.5-flash', temperature: 0.2 } },
        );

        let firstWith = null;
        const startWith = Date.now();
        const replyWith = await client.sendCompletion(simpleContents, {
          abortController: ac1,
          onProgress: () => {
            if (firstWith == null) firstWith = Date.now();
          },
        });
        const totalWith = Date.now() - startWith;
        const firstMsWith = firstWith ? firstWith - startWith : null;
        expect(replyWith.length).toBeGreaterThan(0);

        // Without thinkingBudget: direct SDK call (no thinkingConfig)
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const ai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const req = {
          model: 'gemini-2.5-flash',
          contents: simpleContents,
          generationConfig: { temperature: 0.2 },
        };

        let firstWithout = null;
        const startWithout = Date.now();
        const stream = await model.generateContentStream(req, { signal: ac2.signal });
        let chars = 0;
        for await (const chunk of stream.stream) {
          if (firstWithout == null) firstWithout = Date.now();
          const t = chunk.text();
          chars += t.length;
        }
        const totalWithout = Date.now() - startWithout;
        const firstMsWithout = firstWithout ? firstWithout - startWithout : null;
        expect(chars).toBeGreaterThan(0);

        // eslint-disable-next-line no-console
        console.log(
          `with thinkingBudget=0: first=${firstMsWith}ms total=${totalWith}ms | without: first=${firstMsWithout}ms total=${totalWithout}ms`,
        );

        expect(firstMsWith).not.toBeNull();
        expect(firstMsWithout).not.toBeNull();
      } finally {
        ac1.abort();
        ac2.abort();
      }
    },
    120000,
  );
});