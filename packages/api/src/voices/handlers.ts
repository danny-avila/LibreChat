import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';

const VOICES_DIR = process.env.VOICES_DIR || path.resolve(process.cwd(), 'tts_server/voices');

function getVoiceDiskStatus(voiceName: string) {
  const wavPath = path.join(VOICES_DIR, `${voiceName}.wav`);
  const txtPath = path.join(VOICES_DIR, `${voiceName}.txt`);
  const hasAudio = fs.existsSync(wavPath);
  const hasTxt = fs.existsSync(txtPath);
  let refText = null;
  if (hasTxt) {
    try {
      refText = fs.readFileSync(txtPath, 'utf-8').trim();
    } catch {}
  }
  return { hasAudio, hasTxt, refText, wavPath, txtPath };
}

export function createVoicesHandlers(voiceProfileMethods: {
  getVoiceInstructForUser: (user: any, voiceName: string) => Promise<string | null>;
  canUserConfigureVoice: (user: any, voiceName: string) => Promise<boolean>;
}): {
  listVoices: (req: ServerRequest, res: Response) => Promise<Response>;
  listConfigurableVoices: (req: ServerRequest, res: Response) => Promise<Response>;
  createVoice: (req: ServerRequest, res: Response) => Promise<Response>;
  updateVoice: (req: ServerRequest, res: Response) => Promise<Response>;
  deleteVoice: (req: ServerRequest, res: Response) => Promise<Response>;
  getVoiceAudio: (req: ServerRequest, res: Response) => Promise<Response | void>;
  uploadVoiceAudio: (req: ServerRequest, res: Response) => Promise<Response>;
  deleteVoiceAudio: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  const VoiceProfile = mongoose.models.VoiceProfile;

  // GET /api/voices
  async function listVoices(req: ServerRequest, res: Response) {
    try {
      const dbProfiles = await VoiceProfile.find({});
      const dbNames = dbProfiles.map((p) => p.name);

      let diskVoices: string[] = [];
      if (fs.existsSync(VOICES_DIR)) {
        diskVoices = fs
          .readdirSync(VOICES_DIR)
          .filter((f) => f.endsWith('.wav'))
          .map((f) => path.basename(f, '.wav'));
      }

      const tts = req.config?.speech?.tts;
      const configuredVoices = new Set<string>();
      if (tts) {
        for (const provider of ['openai', 'azureOpenAI', 'elevenlabs', 'localai'] as const) {
          const providerConfig = tts[provider];
          if (providerConfig && Array.isArray(providerConfig.voices)) {
            providerConfig.voices.forEach((v) => configuredVoices.add(v));
          }
        }
      }

      const allNames = Array.from(new Set([...dbNames, ...diskVoices, ...configuredVoices]));
      const accessibleProfiles = [];

      for (const voiceName of allNames) {
        const profile = dbProfiles.find((p) => p.name === voiceName);
        const { hasAudio, refText } = getVoiceDiskStatus(voiceName);

        if (!profile) {
          accessibleProfiles.push({
            name: voiceName,
            instruct: '',
            authorizedUseRoles: ['ADMIN', 'USER'],
            authorizedUseGroups: [],
            hasAudio,
            refText,
          });
          continue;
        }

        try {
          await voiceProfileMethods.getVoiceInstructForUser(req.user, voiceName);
          accessibleProfiles.push({
            name: profile.name,
            instruct: profile.instruct,
            authorizedUseRoles: profile.authorizedUseRoles,
            authorizedUseGroups: profile.authorizedUseGroups,
            hasAudio,
            refText,
          });
        } catch {
          // No access
        }
      }

      return res.status(200).json(accessibleProfiles);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch voice profiles' });
    }
  }

  // GET /api/voices/config
  async function listConfigurableVoices(req: ServerRequest, res: Response) {
    try {
      let diskVoices: string[] = [];
      if (fs.existsSync(VOICES_DIR)) {
        diskVoices = fs
          .readdirSync(VOICES_DIR)
          .filter((f) => f.endsWith('.wav'))
          .map((f) => path.basename(f, '.wav'));
      }

      const tts = req.config?.speech?.tts;
      const configuredVoices = new Set<string>();
      if (tts) {
        for (const provider of ['openai', 'azureOpenAI', 'elevenlabs', 'localai'] as const) {
          const providerConfig = tts[provider];
          if (providerConfig && Array.isArray(providerConfig.voices)) {
            providerConfig.voices.forEach((v) => configuredVoices.add(v));
          }
        }
      }

      const dbProfiles = await VoiceProfile.find({});
      const dbNames = dbProfiles.map((p) => p.name);
      const allNames = Array.from(new Set([...dbNames, ...diskVoices, ...configuredVoices]));

      const result = [];
      const isAdmin = req.user?.role === 'ADMIN';

      for (const voiceName of allNames) {
        const profile = dbProfiles.find((p) => p.name === voiceName);
        const { hasAudio, hasTxt, refText } = getVoiceDiskStatus(voiceName);
        const diskStatus = { hasAudio, hasTxt, refText };

        if (!profile) {
          if (isAdmin) {
            result.push({
              _id: null,
              name: voiceName,
              instruct: '',
              authorizedConfigRoles: ['ADMIN'],
              authorizedConfigGroups: [],
              authorizedUseRoles: ['ADMIN', 'USER'],
              authorizedUseGroups: [],
              ...diskStatus,
            });
          }
          continue;
        }

        const canConfig = await voiceProfileMethods.canUserConfigureVoice(req.user, voiceName);
        if (canConfig) {
          result.push({ ...profile.toObject(), ...diskStatus });
        }
      }

      for (const profile of dbProfiles) {
        if (!result.find((r) => r.name === profile.name)) {
          const canConfig = await voiceProfileMethods.canUserConfigureVoice(req.user, profile.name);
          if (canConfig) {
            const { hasAudio, hasTxt, refText } = getVoiceDiskStatus(profile.name);
            result.push({ ...profile.toObject(), hasAudio, hasTxt, refText });
          }
        }
      }

      return res.status(200).json(result);
    } catch (err) {
      console.error('Error fetching configurable voices:', err);
      return res.status(500).json({ error: 'Failed to fetch configurable voice profiles' });
    }
  }

  // POST /api/voices
  async function createVoice(req: ServerRequest, res: Response) {
    try {
      if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only administrators can create new voice profiles' });
      }

      const { name, instruct, authorizedConfigRoles, authorizedConfigGroups, authorizedUseRoles, authorizedUseGroups } =
        req.body;

      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const existing = await VoiceProfile.findOne({ name });
      if (existing) {
        return res.status(400).json({ error: `Voice profile ${name} already exists` });
      }

      const newProfile = new VoiceProfile({
        name,
        instruct: instruct || '',
        authorizedConfigRoles: authorizedConfigRoles || ['ADMIN'],
        authorizedConfigGroups: authorizedConfigGroups || [],
        authorizedUseRoles: authorizedUseRoles || ['ADMIN', 'USER'],
        authorizedUseGroups: authorizedUseGroups || [],
      });

      await newProfile.save();
      const { hasAudio, hasTxt, refText } = getVoiceDiskStatus(name);
      return res.status(201).json({ ...newProfile.toObject(), hasAudio, hasTxt, refText });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to create voice profile' });
    }
  }

  // PUT /api/voices/:name
  async function updateVoice(req: ServerRequest, res: Response) {
    try {
      const { name } = req.params;
      const canConfig = await voiceProfileMethods.canUserConfigureVoice(req.user, name);
      if (!canConfig) {
        return res.status(403).json({ error: `You do not have permission to configure voice profile: ${name}` });
      }

      const { instruct, authorizedConfigRoles, authorizedConfigGroups, authorizedUseRoles, authorizedUseGroups } =
        req.body;

      let profile = await VoiceProfile.findOne({ name });
      if (!profile) {
        profile = new VoiceProfile({ name });
      }

      if (instruct !== undefined) { profile.instruct = instruct; }
      if (authorizedConfigRoles !== undefined) { profile.authorizedConfigRoles = authorizedConfigRoles; }
      if (authorizedConfigGroups !== undefined) { profile.authorizedConfigGroups = authorizedConfigGroups; }
      if (authorizedUseRoles !== undefined) { profile.authorizedUseRoles = authorizedUseRoles; }
      if (authorizedUseGroups !== undefined) { profile.authorizedUseGroups = authorizedUseGroups; }

      await profile.save();
      const { hasAudio, hasTxt, refText } = getVoiceDiskStatus(name);
      return res.status(200).json({ ...profile.toObject(), hasAudio, hasTxt, refText });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to update voice profile' });
    }
  }

  // DELETE /api/voices/:name
  async function deleteVoice(req: ServerRequest, res: Response) {
    try {
      const { name } = req.params;
      const canConfig = await voiceProfileMethods.canUserConfigureVoice(req.user, name);
      if (!canConfig) {
        return res.status(403).json({ error: `You do not have permission to configure voice profile: ${name}` });
      }

      await VoiceProfile.deleteOne({ name });
      return res.status(200).json({ message: 'Voice profile reset to default' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to delete voice profile' });
    }
  }

  // GET /api/voices/:name/audio
  async function getVoiceAudio(req: ServerRequest, res: Response) {
    try {
      const { name } = req.params;

      const profile = await VoiceProfile.findOne({ name });
      if (profile) {
        try {
          await voiceProfileMethods.getVoiceInstructForUser(req.user, name);
        } catch (err) {
          return res.status(403).json({ error: 'You do not have permission to access this voice' });
        }
      }

      const wavPath = path.join(VOICES_DIR, `${name}.wav`);
      if (!fs.existsSync(wavPath)) {
        return res.status(404).json({ error: 'No reference audio found for this voice' });
      }
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Disposition', `inline; filename="${name}.wav"`);
      return fs.createReadStream(wavPath).pipe(res);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to serve audio file' });
    }
  }

  // POST /api/voices/:name/audio
  async function uploadVoiceAudio(req: ServerRequest, res: Response) {
    try {
      const { name } = req.params;

      const isAdmin = req.user?.role === 'ADMIN';
      const hasDbEntry = !!(await VoiceProfile.findOne({ name }));
      if (!isAdmin && !hasDbEntry) {
        return res.status(403).json({ error: 'Only administrators can upload audio for new voices' });
      }
      if (hasDbEntry) {
        const canConfig = await voiceProfileMethods.canUserConfigureVoice(req.user, name);
        if (!canConfig) {
          return res.status(403).json({ error: `You do not have permission to upload audio for: ${name}` });
        }
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No audio file uploaded' });
      }

      const { refText } = req.body;
      if (!refText || !refText.trim()) {
        return res.status(400).json({ error: 'Reference transcript (refText) is required' });
      }

      if (!fs.existsSync(VOICES_DIR)) {
        fs.mkdirSync(VOICES_DIR, { recursive: true });
      }

      const wavPath = path.join(VOICES_DIR, `${name}.wav`);
      fs.writeFileSync(wavPath, req.file.buffer);

      const txtPath = path.join(VOICES_DIR, `${name}.txt`);
      fs.writeFileSync(txtPath, refText.trim(), 'utf-8');

      return res.status(200).json({
        message: `Reference audio and transcript saved for ${name}`,
        hasAudio: true,
        hasTxt: true,
        refText: refText.trim(),
      });
    } catch (err: any) {
      console.error('Error uploading voice audio:', err);
      return res.status(500).json({ error: err.message || 'Failed to upload audio' });
    }
  }

  // DELETE /api/voices/:name/audio
  async function deleteVoiceAudio(req: ServerRequest, res: Response) {
    try {
      const { name } = req.params;
      if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only administrators can remove reference audio' });
      }

      const wavPath = path.join(VOICES_DIR, `${name}.wav`);
      const txtPath = path.join(VOICES_DIR, `${name}.txt`);

      let removed = 0;
      if (fs.existsSync(wavPath)) {
        fs.unlinkSync(wavPath);
        removed++;
      }
      if (fs.existsSync(txtPath)) {
        fs.unlinkSync(txtPath);
        removed++;
      }

      if (removed === 0) {
        return res.status(404).json({ error: 'No audio files found to remove' });
      }

      return res.status(200).json({ message: `Reference audio removed for ${name}` });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to remove audio files' });
    }
  }

  return {
    listVoices,
    listConfigurableVoices,
    createVoice,
    updateVoice,
    deleteVoice,
    getVoiceAudio,
    uploadVoiceAudio,
    deleteVoiceAudio,
  };
}
