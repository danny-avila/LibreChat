import { useCallback, useEffect, useState } from 'react';
import { personalizationApi, type MeoAiSettings, type PersonalMemory } from './personalizationApi';
import './MeoPersonalizationSettings.css';

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Unable to load your settings.';
}

export default function MeoPersonalizationSettings() {
  const [settings, setSettings] = useState<MeoAiSettings | null>(null);
  const [instructions, setInstructions] = useState('');
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memories, setMemories] = useState<PersonalMemory[]>([]);
  const [archived, setArchived] = useState(false);
  const [draft, setDraft] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async (showArchived = false) => {
    const [nextSettings, nextMemories] = await Promise.all([
      personalizationApi.settings(), personalizationApi.memories(showArchived),
    ]);
    setSettings(nextSettings);
    setInstructions(nextSettings.personalInstructions);
    setMemoryEnabled(nextSettings.memoryEnabled);
    setMemories(nextMemories);
    setArchived(showArchived);
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([personalizationApi.settings(), personalizationApi.memories()])
      .then(([current, items]) => {
        if (!mounted) return;
        setSettings(current);
        setInstructions(current.personalInstructions);
        setMemoryEnabled(current.memoryEnabled);
        setMemories(items);
      })
      .catch((cause: unknown) => { if (mounted) setError(message(cause)); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (cause) {
      setError(message(cause));
      if (cause instanceof Error && cause.message.includes('another device')) {
        setNotice('Your changes were not overwritten. Reload to review the latest version.');
      }
    }
    finally { setBusy(false); }
  }

  const changed = settings && (instructions !== settings.personalInstructions ||
    memoryEnabled !== settings.memoryEnabled);

  return (
    <main className="meo-personalization" aria-label="Meo AI settings">
      <div className="meo-personalization-content">
        <header><h1>Personalization</h1>
          <p>Account-level preferences and memory. Changes sync between Meo AI clients.</p>
        </header>
        {error && <p role="alert" className="meo-personalization-error">{error}</p>}
        {notice && <p role="status" className="meo-personalization-notice">{notice}</p>}
        {loading ? <p role="status">Loading settings…</p> : !settings ?
          <button type="button" onClick={() => perform(async () => refresh())}>Retry loading</button> :
          <>
            <section aria-labelledby="meo-instructions-title">
              <h2 id="meo-instructions-title">Personal instructions</h2>
              <p>Tell Meo AI how to respond. Avoid storing passwords or private keys.</p>
              <textarea aria-label="Personal instructions" value={instructions}
                maxLength={5000} disabled={busy} rows={5}
                placeholder="For example: Keep answers concise and explain technical terms."
                onChange={e => setInstructions(e.target.value)} />
              <div className="meo-personalization-actions">
                <small>{instructions.length} / 5000</small>
                <button type="button" className="primary" disabled={!changed || busy}
                  onClick={() => perform(async () => {
                    const saved = await personalizationApi.saveSettings({
                      expectedVersion: settings.version, personalInstructions: instructions, memoryEnabled,
                    });
                    setSettings(saved);
                    setNotice('Account preferences saved.');
                  })}>Save changes</button>
              </div>
            </section>
            <section aria-labelledby="meo-memory-title">
              <h2 id="meo-memory-title">Memory</h2>
              <label className="meo-personalization-switch">
                <input type="checkbox" checked={memoryEnabled} disabled={busy}
                  onChange={e => setMemoryEnabled(e.target.checked)} />
                Use saved memories in model requests
              </label>
              <p>Save the toggle above to apply it. Disabled and archived items stay out of model context.</p>
              <div className="meo-personalization-actions">
                <h3>{archived ? 'Archived memories' : 'Saved memories'}</h3>
                <button type="button" disabled={busy}
                  onClick={() => perform(async () => { await refresh(!archived); })}>
                  {archived ? 'Show active' : 'View archive'}
                </button>
              </div>
              {!archived && <form className="meo-personalization-add"
                onSubmit={e => { e.preventDefault(); if (!draft.trim()) return;
                  void perform(async () => {
                    const memory = await personalizationApi.addMemory('fact', draft.trim());
                    setMemories(items => [memory, ...items]); setDraft('');
                    setNotice('Memory saved.');
                  });
                }}>
                <textarea value={draft} rows={2} maxLength={2000} disabled={busy}
                  aria-label="New personal memory"
                  placeholder="Add something useful for future conversations…"
                  onChange={e => setDraft(e.target.value)} />
                <div className="meo-personalization-actions">
                  <small>{draft.length} / 2000</small>
                  <button type="submit" disabled={!draft.trim() || busy}>Add memory</button>
                </div>
              </form>}
              {memories.length === 0 && <p>{archived ? 'No archived memories.' : 'No memories saved yet.'}</p>}
              <ul className="meo-personalization-memories">
                {memories.map(item => <li key={item.id}>
                  {editId === item.id ? <>
                    <textarea value={editContent} maxLength={2000} rows={3}
                      aria-label="Edit memory" onChange={e => setEditContent(e.target.value)} />
                    <div className="meo-personalization-actions">
                      <button type="button" onClick={() => setEditId(null)}>Cancel</button>
                      <button type="button" disabled={!editContent.trim() || busy}
                        onClick={() => perform(async () => {
                          const next = await personalizationApi.updateMemory(item, { content: editContent.trim() });
                          setMemories(items => items.map(m => m.id === next.id ? next : m));
                          setEditId(null);
                        })}>Save</button>
                    </div>
                  </> : <>
                    <small>{item.kind}{!item.enabled ? ' · disabled' : ''}</small>
                    <p>{item.content}</p>
                    <div className="meo-personalization-actions">
                      <button type="button" disabled={busy} onClick={() => {
                        setEditId(item.id); setEditContent(item.content);
                      }}>Edit</button>
                      {!archived && <button type="button" disabled={busy}
                        onClick={() => perform(async () => {
                          const next = await personalizationApi.updateMemory(item, { enabled: !item.enabled });
                          setMemories(items => items.map(m => m.id === next.id ? next : m));
                        })}>{item.enabled ? 'Disable' : 'Enable'}</button>}
                      <button type="button" disabled={busy}
                        onClick={() => perform(async () => {
                          const next = await personalizationApi.updateMemory(item, { archived: !archived });
                          setMemories(items => items.filter(m => m.id !== next.id));
                        })}>{archived ? 'Restore' : 'Archive'}</button>
                      <button type="button" disabled={busy} onClick={() => {
                        if (!window.confirm('Permanently delete this memory?')) return;
                        void perform(async () => {
                          await personalizationApi.deleteMemory(item);
                          setMemories(items => items.filter(m => m.id !== item.id));
                        });
                      }}>Delete</button>
                    </div>
                  </>}
                </li>)}
              </ul>
            </section>
          </>}
      </div>
    </main>
  );
}
