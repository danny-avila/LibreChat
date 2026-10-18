import { useEffect, useState } from 'react';
import { projectsApi, type MeoProject, type MeoProjectMemory } from './projectsApi';
import './MeoProjects.css';

const errorText = (reason: unknown) =>
  reason instanceof Error ? reason.message : 'The request could not be completed.';

export default function MeoProjects() {
  const [projects, setProjects] = useState<MeoProject[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [memories, setMemories] = useState<MeoProjectMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [newMemory, setNewMemory] = useState('');

  const active = projects.find(project => project.id === selected) ?? null;
  const changed = !!active && (
    name !== active.name || description !== active.description || instructions !== active.instructions
  );

  useEffect(() => {
    let live = true;
    projectsApi.list()
      .then(items => {
        if (!live) return;
        setProjects(items);
        setSelected(current => current && items.some(p => p.id === current)
          ? current : items[0]?.id ?? null);
      })
      .catch(reason => { if (live) setError(errorText(reason)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!selected) { setMemories([]); return; }
    let live = true;
    setMemoryLoading(true);
    projectsApi.memories(selected)
      .then(items => { if (live) setMemories(items); })
      .catch(reason => { if (live) setError(errorText(reason)); })
      .finally(() => { if (live) setMemoryLoading(false); });
    return () => { live = false; };
  }, [selected]);

  useEffect(() => {
    if (!active || creating) return;
    setName(active.name);
    setDescription(active.description || '');
    setInstructions(active.instructions || '');
  }, [active?.id, creating]);

  async function act(callback: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    setError('');
    try { await callback(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  function selectProject(id: string) {
    if (busy) return;
    if (changed && !window.confirm('Discard unsaved changes to this project?')) return;
    setCreating(false);
    setSelected(id);
    setError('');
  }

  return (
    <main className="meo-projects" aria-label="Meo AI Projects">
      <div className="meo-projects-content">
        <header className="meo-projects-header">
          <div>
            <h1>Projects</h1>
            <p>Keep instructions and project memories in one place.</p>
          </div>
          <button type="button" disabled={busy}
            onClick={() => {
              if (changed && !window.confirm('Discard unsaved project changes?')) return;
              setCreating(true); setName(''); setDescription(''); setInstructions('');
              setError(''); setNotice('');
            }}>New project</button>
        </header>
        {error && <p role="alert" className="meo-projects-alert">{error}</p>}
        {notice && <p role="status" className="meo-projects-notice">{notice}</p>}
        {loading ? <p role="status">Loading projects…</p> : (
          <div className="meo-projects-layout">
            <aside aria-label="Project list" className="meo-projects-list">
              {projects.length === 0 && <p>No projects yet. Create one to get started.</p>}
              {projects.map(project => (
                <button key={project.id} type="button"
                  aria-current={!creating && selected === project.id ? 'page' : undefined}
                  className={!creating && selected === project.id ? 'is-active' : ''}
                  onClick={() => selectProject(project.id)}>
                  <strong>{project.name}</strong>
                  {project.description && <span>{project.description}</span>}
                </button>
              ))}
            </aside>
            <section className="meo-projects-editor" aria-label={creating ? 'Create project' : 'Project details'}>
              {creating || active ? (
                <>
                  <h2>{creating ? 'Create project' : 'Project details'}</h2>
                  <form onSubmit={event => {
                    event.preventDefault();
                    void act(async () => {
                      if (creating) {
                        const project = await projectsApi.create({
                          name: name.trim(), description: description.trim(), instructions: instructions.trim(),
                        });
                        setProjects(current => [project, ...current]);
                        setCreating(false); setSelected(project.id);
                        setNotice('Project created.');
                      } else if (active) {
                        const updated = await projectsApi.update(active.id, {
                          name: name.trim(), description: description.trim(), instructions: instructions.trim(),
                        });
                        setProjects(current => current.map(p => p.id === updated.id ? updated : p));
                        setNotice('Project saved.');
                      }
                    });
                  }}>
                    <label htmlFor="meo-project-name">Name</label>
                    <input id="meo-project-name" value={name} maxLength={160} required disabled={busy}
                      onChange={e => setName(e.target.value)} />
                    <label htmlFor="meo-project-description">Description</label>
                    <textarea id="meo-project-description" value={description} rows={3} maxLength={4000}
                      disabled={busy} onChange={e => setDescription(e.target.value)} />
                    <label htmlFor="meo-project-instructions">Project instructions</label>
                    <textarea id="meo-project-instructions" value={instructions} rows={5} maxLength={16000}
                      disabled={busy} onChange={e => setInstructions(e.target.value)} />
                    <p className="meo-projects-hint">Instructions can affect chats assigned to this project. Project memory is separate from account memory.</p>
                    <div className="meo-projects-actions">
                      {creating && <button type="button" disabled={busy} onClick={() => {
                        setCreating(false); setSelected(projects[0]?.id ?? null);
                      }}>Cancel</button>}
                      <button type="submit" className="primary" disabled={busy || !name.trim() || (!creating && !changed)}>
                        {creating ? 'Create project' : 'Save changes'}
                      </button>
                    </div>
                  </form>
                  {!creating && active && (
                    <section className="meo-projects-memory" aria-label="Project memory">
                      <h3>Project memory</h3>
                      <p className="meo-projects-hint">Reference information for this project, not system instructions.</p>
                      <form onSubmit={event => {
                        event.preventDefault();
                        if (!newMemory.trim()) return;
                        void act(async () => {
                          const memory = await projectsApi.addMemory(active.id, newMemory.trim());
                          setMemories(current => [memory, ...current]); setNewMemory('');
                          setNotice('Project memory saved.');
                        });
                      }}>
                        <textarea aria-label="New project memory" rows={2} maxLength={8000}
                          placeholder="A useful decision, reference or project note…" value={newMemory}
                          disabled={busy || memoryLoading}
                          onChange={e => setNewMemory(e.target.value)} />
                        <div className="meo-projects-actions">
                          <button type="submit" disabled={busy || !newMemory.trim() || memoryLoading}>
                            Add memory
                          </button>
                        </div>
                      </form>
                      {memoryLoading && <p role="status">Loading project memory…</p>}
                      {!memoryLoading && memories.length === 0 && <p className="meo-projects-hint">Nothing saved for this project yet.</p>}
                      {!memoryLoading && <ul>{memories.map(memory =>
                        <li key={memory.id}>
                          <small>{memory.kind}{memory.pinned ? ' · pinned' : ''}</small>
                          <p>{memory.content}</p>
                        </li>,
                      )}</ul>}
                    </section>
                  )}
                </>
              ) : <p>Select a project or create a new one.</p>}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
