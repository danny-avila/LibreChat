const express = require('express');
const sharp = require('sharp');
const app = express();
app.use(express.json({ limit: '2mb' }));
let submissions = 0;
app.get('/health', (_req, res) => res.send('ready'));
app.get('/counts', (_req, res) => res.json({ submissions }));
app.post('/v1/images/generations', async (_req, res) => {
  submissions++;
  const bytes = await sharp({
    create: {
      width: 320,
      height: 240,
      channels: 4,
      background: { r: 80, g: 140, b: 170, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  res.json({ data: [{ b64_json: bytes.toString('base64') }] });
});
app.post('/v1/images/edits', async (_req, res) => {
  submissions++;
  const bytes = await sharp({
    create: {
      width: 320,
      height: 240,
      channels: 4,
      background: { r: 170, g: 110, b: 90, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  res.json({ data: [{ b64_json: bytes.toString('base64') }] });
});
const port = Number(process.env.E2E_MEDIA_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('E2E_MEDIA_PORT must be a valid TCP port');
}
app.listen(port, '127.0.0.1');
