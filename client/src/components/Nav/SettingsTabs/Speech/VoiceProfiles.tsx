import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthContext } from '~/hooks/AuthContext';
import { useToastContext } from '@librechat/client';
import { request } from 'librechat-data-provider';
import {
  Music,
  Shield,
  Trash2,
  Save,
  RotateCcw,
  Settings,
  Users,
  Upload,
  Play,
  Pause,
  Plus,
  X,
  Mic,
  FileAudio,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────
interface VoiceProfile {
  _id?: string | null;
  name: string;
  instruct: string;
  authorizedConfigRoles: string[];
  authorizedConfigGroups: string[];
  authorizedUseRoles: string[];
  authorizedUseGroups: string[];
  hasAudio?: boolean;
  hasTxt?: boolean;
  refText?: string | null;
}

// ─────────────────────────────────────────────────
// Mini audio player component
// ─────────────────────────────────────────────────
function AudioPlayer({ voiceName, disabled }: { voiceName: string; disabled?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const cleanupObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  const stopPlayback = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    cleanupObjectUrl();
    setPlaying(false);
  };

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  const toggle = async () => {
    if (disabled || loading) {
      return;
    }

    if (playing) {
      stopPlayback();
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/voices/${encodeURIComponent(voiceName)}/audio`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('No reference audio found for this voice');
      }

      const blob = await res.blob();
      cleanupObjectUrl();
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;

      const audio = new Audio(objectUrl);
      audio.onended = stopPlayback;
      audio.onerror = stopPlayback;
      audioRef.current = audio;
      setPlaying(true);
      await audio.play();
    } catch {
      stopPlayback();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={playing ? 'Pause reference audio' : 'Play reference audio'}
      aria-label={playing ? 'Pause reference audio' : 'Play reference audio'}
      className="btn btn-neutral relative h-9 w-9 p-0 disabled:opacity-50"
    >
      {loading ? (
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : playing ? (
        <Pause className="h-4 w-4" />
      ) : (
        <Play className="h-4 w-4" />
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────
// Drop-zone audio uploader
// ─────────────────────────────────────────────────
interface AudioUploaderProps {
  voiceName: string;
  currentRefText: string | null | undefined;
  onUploaded: (refText: string) => void;
}

function AudioUploader({ voiceName, currentRefText, onUploaded }: AudioUploaderProps) {
  const { showToast } = useToastContext();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [refText, setRefText] = useState(currentRefText || '');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleUpload = async () => {
    if (!file) {
      showToast({ message: 'Please select an audio file', status: 'warning' });
      return;
    }
    if (!refText.trim()) {
      showToast({ message: 'Please enter the reference transcript', status: 'warning' });
      return;
    }

    const formData = new FormData();
    formData.append('audio', file);
    formData.append('refText', refText.trim());

    try {
      setUploading(true);
      const res = await fetch(`/api/voices/${voiceName}/audio`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }
      showToast({ message: `Audio uploaded for ${voiceName}`, status: 'success' });
      setFile(null);
      onUploaded(refText.trim());
    } catch (err: any) {
      showToast({ message: err.message || 'Failed to upload audio', status: 'error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
          dragging
            ? 'border-gray-400 bg-gray-100 dark:border-gray-500 dark:bg-gray-800'
            : 'border-gray-300 bg-gray-50 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:hover:bg-gray-800'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".wav,.mp3,.m4a,.ogg,.flac"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
        />
        {file ? (
          <>
            <FileAudio className="mb-1 h-7 w-7 text-gray-500" />
            <p className="text-xs font-medium text-gray-700 dark:text-gray-200">{file.name}</p>
            <p className="text-[10px] text-gray-400">
              {(file.size / 1024).toFixed(1)} KB - click to change
            </p>
          </>
        ) : (
          <>
            <Upload className="mb-1 h-7 w-7 text-gray-400 dark:text-gray-500" />
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
              Drop reference audio here, or{' '}
              <span className="text-gray-800 dark:text-gray-100">browse</span>
            </p>
            <p className="text-[10px] text-gray-400">WAV · MP3 · M4A · OGG · FLAC — max 50 MB</p>
          </>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Reference Transcript <span className="text-red-500">*</span>
        </label>
        <textarea
          value={refText}
          onChange={(e) => setRefText(e.target.value)}
          rows={2}
          placeholder="Exactly what the speaker says in the audio clip…"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-gray-500"
        />
        <p className="text-[10px] text-gray-400">
          Must match the audio exactly — used by the TTS engine for voice cloning.
        </p>
      </div>

      <button
        type="button"
        disabled={uploading || !file}
        onClick={handleUpload}
        className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
      >
        {uploading ? (
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        {uploading ? 'Uploading…' : 'Save Reference Audio'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────
// Create Voice Modal
// ─────────────────────────────────────────────────
interface CreateVoiceModalProps {
  onClose: () => void;
  onCreated: (profile: VoiceProfile) => void;
}

function CreateVoiceModal({ onClose, onCreated }: CreateVoiceModalProps) {
  const { showToast } = useToastContext();
  const [name, setName] = useState('');
  const [instruct, setInstruct] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim().replace(/\s+/g, '_');
    if (!trimmed) {
      showToast({ message: 'Voice name is required', status: 'warning' });
      return;
    }

    try {
      setSaving(true);
      const created = (await request.post('/api/voices', {
        name: trimmed,
        instruct: instruct.trim(),
        authorizedConfigRoles: ['ADMIN'],
        authorizedConfigGroups: [],
        authorizedUseRoles: ['ADMIN', 'USER'],
        authorizedUseGroups: [],
      })) as VoiceProfile;
      showToast({ message: `Voice '${trimmed}' created`, status: 'success' });
      onCreated(created);
      onClose();
    } catch (err: any) {
      showToast({
        message: err?.response?.data?.error || 'Failed to create voice',
        status: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
              <Mic className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              New Voice Profile
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Voice Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Sarah, Marcus, Adaeze…"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-gray-500"
            />
            <p className="text-[10px] text-gray-400">Spaces will be replaced with underscores.</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Acoustic Personality (Soul)
            </label>
            <textarea
              value={instruct}
              onChange={(e) => setInstruct(e.target.value)}
              rows={3}
              placeholder="Describe accent, pitch, pacing, energy, tone…"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-gray-500"
            />
            <p className="text-[10px] text-gray-400">
              You can upload the reference audio after creating the profile.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-800">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
          >
            {saving ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Create Voice
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────
export default function VoiceProfilesConfigList() {
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const isAdmin = user?.role === 'ADMIN';

  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingVoice, setSavingVoice] = useState<string | null>(null);
  const [deletingVoice, setDeletingVoice] = useState<string | null>(null);
  const [removingAudio, setRemovingAudio] = useState<string | null>(null);
  const [editingVoice, setEditingVoice] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Which section is expanded inside the edit panel
  const [expandedSections, setExpandedSections] = useState<Record<string, Set<string>>>({});

  // Form state — keyed per voice to avoid interference
  const [soul, setSoul] = useState('');
  const [useRoles, setUseRoles] = useState<string[]>(['ADMIN', 'USER']);
  const [useGroupsInput, setUseGroupsInput] = useState('');
  const [configRoles, setConfigRoles] = useState<string[]>(['ADMIN']);
  const [configGroupsInput, setConfigGroupsInput] = useState('');

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const data = await request.get<VoiceProfile[]>('/api/voices/config');
      setProfiles(data);
    } catch (err: any) {
      showToast({ message: 'Failed to load voice profiles', status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const toggleSection = (voiceName: string, section: string) => {
    setExpandedSections((prev) => {
      const current = new Set(prev[voiceName] || []);
      current.has(section) ? current.delete(section) : current.add(section);
      return { ...prev, [voiceName]: current };
    });
  };

  const isSectionOpen = (voiceName: string, section: string) =>
    expandedSections[voiceName]?.has(section) ?? false;

  const handleStartEdit = (voiceName: string) => {
    const existing = profiles.find((p) => p.name === voiceName);
    if (existing) {
      setSoul(existing.instruct || '');
      setUseRoles(existing.authorizedUseRoles || ['ADMIN', 'USER']);
      setUseGroupsInput((existing.authorizedUseGroups || []).join(', '));
      setConfigRoles(existing.authorizedConfigRoles || ['ADMIN']);
      setConfigGroupsInput((existing.authorizedConfigGroups || []).join(', '));
    } else {
      setSoul('');
      setUseRoles(['ADMIN', 'USER']);
      setUseGroupsInput('');
      setConfigRoles(['ADMIN']);
      setConfigGroupsInput('');
    }
    setEditingVoice(voiceName);
    setExpandedSections((prev) => ({
      ...prev,
      [voiceName]: new Set(['soul', 'audio']),
    }));
  };

  const handleCancelEdit = () => setEditingVoice(null);

  const handleSave = async (voiceName: string) => {
    const payload = {
      name: voiceName,
      instruct: soul.trim(),
      authorizedUseRoles: useRoles,
      authorizedUseGroups: useGroupsInput
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean),
      authorizedConfigRoles: configRoles,
      authorizedConfigGroups: configGroupsInput
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean),
    };

    const existing = profiles.find((p) => p.name === voiceName);

    try {
      setSavingVoice(voiceName);
      if (existing?._id) {
        const updated = (await request.put(`/api/voices/${voiceName}`, payload)) as VoiceProfile;
        showToast({ message: `'${voiceName}' updated`, status: 'success' });
        setProfiles((prev) => prev.map((p) => (p.name === voiceName ? { ...p, ...updated } : p)));
      } else {
        const created = (await request.post('/api/voices', payload)) as VoiceProfile;
        showToast({ message: `'${voiceName}' profile saved`, status: 'success' });
        setProfiles((prev) => [...prev.filter((p) => p.name !== voiceName), created]);
      }
      setEditingVoice(null);
    } catch (err: any) {
      showToast({
        message: err?.response?.data?.error || `Failed to save '${voiceName}'`,
        status: 'error',
      });
    } finally {
      setSavingVoice(null);
    }
  };

  const handleDelete = async (voiceName: string) => {
    if (
      !confirm(
        `Reset '${voiceName}' to engine defaults? This removes custom settings but keeps audio files.`,
      )
    )
      return;
    try {
      setDeletingVoice(voiceName);
      await request.delete(`/api/voices/${voiceName}`);
      showToast({ message: `'${voiceName}' reset to default`, status: 'success' });
      setProfiles((prev) => prev.filter((p) => p.name !== voiceName));
      if (editingVoice === voiceName) setEditingVoice(null);
    } catch (err: any) {
      showToast({
        message: err?.response?.data?.error || `Failed to reset '${voiceName}'`,
        status: 'error',
      });
    } finally {
      setDeletingVoice(null);
    }
  };

  const handleRemoveAudio = async (voiceName: string) => {
    if (
      !confirm(
        `Remove reference audio files for '${voiceName}'? The TTS engine will need a restart.`,
      )
    )
      return;
    try {
      setRemovingAudio(voiceName);
      await request.delete(`/api/voices/${voiceName}/audio`);
      showToast({ message: `Audio removed for '${voiceName}'`, status: 'success' });
      setProfiles((prev) =>
        prev.map((p) =>
          p.name === voiceName ? { ...p, hasAudio: false, hasTxt: false, refText: null } : p,
        ),
      );
    } catch (err: any) {
      showToast({
        message: err?.response?.data?.error || 'Failed to remove audio',
        status: 'error',
      });
    } finally {
      setRemovingAudio(null);
    }
  };

  const toggleRole = (setter: React.Dispatch<React.SetStateAction<string[]>>, role: string) => {
    setter((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-700 dark:border-gray-700 dark:border-t-gray-200" />
      </div>
    );
  }

  return (
    <div className="mb-1 flex w-full flex-col gap-2 text-sm">
      <div className="relative flex flex-col items-center px-16 pt-2 text-center">
        {isAdmin && (
          <div className="absolute right-0 top-4">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              aria-label="Create voice profile"
              className="btn btn-neutral relative"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mt-2 text-xl font-medium">Voice Profiles</div>
        <div className="text-xs text-text-secondary">
          Manage reference audio, acoustic personality, and access controls for each TTS voice.
        </div>
      </div>

      <div className="flex flex-col gap-4 px-2 pb-2 pt-1">
        {profiles.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/40">
            <Mic className="mx-auto mb-2 h-8 w-8 text-gray-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No configurable voices found.
            </p>
            {isAdmin && (
              <p className="mt-1 text-xs text-gray-400">
                Click <strong>New Voice</strong> to create one, or add{' '}
                <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">.wav + .txt</code> files
                to{' '}
                <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
                  tts_server/voices/
                </code>
                .
              </p>
            )}
          </div>
        )}

        <div className="space-y-3">
          {profiles.map((profile) => {
            const voiceName = profile.name;
            const isEditing = editingVoice === voiceName;

            return (
              <div
                key={voiceName}
                className={`overflow-hidden rounded-lg border bg-white shadow-sm transition-all dark:bg-gray-900 ${
                  isEditing
                    ? 'border-gray-400 ring-2 ring-gray-200 dark:border-gray-600 dark:ring-gray-800'
                    : 'border-gray-200 dark:border-gray-700/60'
                }`}
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                      {voiceName}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <AudioPlayer voiceName={voiceName} disabled={!profile.hasAudio} />

                    <button
                      type="button"
                      onClick={() => (isEditing ? handleCancelEdit() : handleStartEdit(voiceName))}
                      aria-label={
                        isEditing ? 'Close voice profile editor' : 'Configure voice profile'
                      }
                      title={isEditing ? 'Close voice profile editor' : 'Configure voice profile'}
                      className="btn btn-neutral relative h-9 w-9 p-0"
                    >
                      {isEditing ? <X className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="border-t border-gray-200 dark:border-gray-800">
                    <CollapsibleSection
                      title="Acoustic Personality (Soul)"
                      icon={<Music className="h-3.5 w-3.5 text-gray-600 dark:text-gray-300" />}
                      open={isSectionOpen(voiceName, 'soul')}
                      onToggle={() => toggleSection(voiceName, 'soul')}
                    >
                      <div className="space-y-1">
                        <textarea
                          value={soul}
                          onChange={(e) => setSoul(e.target.value)}
                          placeholder="Describe accent, pitch, pacing, emotion, energy…"
                          rows={3}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-gray-500"
                        />
                      </div>
                    </CollapsibleSection>

                    <CollapsibleSection
                      title="Reference Audio"
                      icon={<FileAudio className="h-3.5 w-3.5 text-gray-600 dark:text-gray-300" />}
                      open={isSectionOpen(voiceName, 'audio')}
                      onToggle={() => toggleSection(voiceName, 'audio')}
                    >
                      {profile.hasAudio && profile.refText && (
                        <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                            Current Transcript
                          </p>
                          <p className="mt-0.5 text-xs italic text-gray-600 dark:text-gray-300">
                            "{profile.refText}"
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <AudioPlayer voiceName={voiceName} />
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleRemoveAudio(voiceName)}
                                disabled={removingAudio === voiceName}
                                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                              >
                                <Trash2 className="h-3 w-3" />
                                Remove Audio
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      <AudioUploader
                        voiceName={voiceName}
                        currentRefText={profile.refText}
                        onUploaded={(refText) => {
                          setProfiles((prev) =>
                            prev.map((p) =>
                              p.name === voiceName
                                ? { ...p, hasAudio: true, hasTxt: true, refText }
                                : p,
                            ),
                          );
                        }}
                      />
                    </CollapsibleSection>

                    <CollapsibleSection
                      title="Access Control (RBAC)"
                      icon={<Shield className="h-3.5 w-3.5 text-gray-600 dark:text-gray-300" />}
                      open={isSectionOpen(voiceName, 'rbac')}
                      onToggle={() => toggleSection(voiceName, 'rbac')}
                    >
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <RbacBlock
                          title="Who Can Use This Voice"
                          icon={<Users className="h-3.5 w-3.5 text-gray-600 dark:text-gray-300" />}
                          roles={useRoles}
                          groupsInput={useGroupsInput}
                          onToggleRole={(r) => toggleRole(setUseRoles, r)}
                          onGroupsChange={setUseGroupsInput}
                          groupsHint="Leave empty to allow all of the selected roles."
                        />

                        <RbacBlock
                          title="Who Can Configure"
                          icon={
                            <Settings className="h-3.5 w-3.5 text-gray-600 dark:text-gray-300" />
                          }
                          roles={configRoles}
                          groupsInput={configGroupsInput}
                          onToggleRole={(r) => toggleRole(setConfigRoles, r)}
                          onGroupsChange={setConfigGroupsInput}
                          groupsHint="Leave empty to restrict to the selected roles only."
                        />
                      </div>
                    </CollapsibleSection>

                    <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
                      <button
                        onClick={handleCancelEdit}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSave(voiceName)}
                        disabled={savingVoice === voiceName}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                      >
                        {savingVoice === voiceName ? (
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Save Settings
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showCreateModal && (
        <CreateVoiceModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(p) => setProfiles((prev) => [...prev, p])}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────

function CollapsibleSection({
  title,
  icon,
  open,
  onToggle,
  badge,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-800">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{title}</span>
          {badge}
        </div>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
        )}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function RbacBlock({
  title,
  icon,
  roles,
  groupsInput,
  onToggleRole,
  onGroupsChange,
  groupsHint,
}: {
  title: string;
  icon: React.ReactNode;
  roles: string[];
  groupsInput: string;
  onToggleRole: (r: string) => void;
  onGroupsChange: (v: string) => void;
  groupsHint: string;
}) {
  return (
    <div className="space-y-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/40">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{title}</span>
      </div>

      <div className="space-y-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
          Roles
        </span>
        <div className="flex gap-4">
          {['ADMIN', 'USER'].map((role) => (
            <label
              key={role}
              className="inline-flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
            >
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={() => onToggleRole(role)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-gray-700 focus:ring-gray-500/30 dark:border-gray-700"
              />
              <span>{role}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
          User Groups
        </span>
        <input
          type="text"
          value={groupsInput}
          onChange={(e) => onGroupsChange(e.target.value)}
          placeholder="Sales, Group-1234 (comma-separated)"
          className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <p className="text-[10px] text-gray-400">{groupsHint}</p>
      </div>
    </div>
  );
}
