import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMeoSession } from './session';
import MeoChat from './MeoChat';
import MeoProjects from './MeoProjects';
import { uiNavigation } from './uiNavigation.generated';
import MeoPersonalizationSettings from './MeoPersonalizationSettings';
import './MeoDesktopApp.css';

type PrimaryMode = 'chat' | 'work' | 'projects' | 'skills';
type IconName =
  | 'add'
  | 'chat'
  | 'work'
  | 'projects'
  | 'skills'
  | 'settings'
  | 'computer'
  | 'menu'
  | 'panel';

const icons: Record<IconName, React.ReactNode> = {
  add: <path d="M12 5v14M5 12h14" />,
  chat: <path d="M5 5h14v10H9l-4 4V5Z" />,
  work: <><path d="M8 7V5h8v2" /><rect x="4" y="7" width="16" height="11" rx="2" /><path d="M4 12h16" /></>,
  projects: <path d="M3.5 6.5h6l2 2h9v10h-17v-12Z" />,
  skills: <><path d="M8.5 3.5h7v4h4v7h-4v4h-7v-4h-4v-7h4v-4Z" /><path d="M11 8.5h2v2h2v2h-2v2h-2v-2H9v-2h2v-2Z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></>,
  computer: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="meo-desktop-icon">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {icons[name]}
      </g>
    </svg>
  );
}

const modeCopy: Record<Exclude<PrimaryMode, 'chat'>, { title: string; description: string; icon: IconName }> = {
  work: {
    title: 'Work',
    description:
      'Run agentic tasks on a chosen computer or environment. Local execution comes first; authenticated remote devices can join later.',
    icon: 'work',
  },
  projects: {
    title: 'Projects',
    description: 'Keep related chats, files and Work together in one persistent place.',
    icon: 'projects',
  },
  skills: {
    title: 'Skills',
    description: 'Use reusable capabilities without mixing them into model, memory or provider settings.',
    icon: 'skills',
  },
};

export default function MeoDesktopApp() {
  const navigate = useNavigate();
  const { user } = useMeoSession();
  const [mode, setMode] = useState<PrimaryMode>('chat');
  const [sidebarHidden, setSidebarHidden] = useState(() => window.matchMedia('(max-width: 759px)').matches);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setMode('chat');
        setSettingsOpen(false);
        navigate('/new');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  const accountLabel = useMemo(() => user?.name || user?.email || 'Meo Account', [user]);

  const selectMode = (next: PrimaryMode) => {
    setSettingsOpen(false);
    if (window.matchMedia('(max-width: 759px)').matches) setSidebarHidden(true);
    setMode(next);
    setInspectorOpen(false);
  };

  return (
    <div className="meo-desktop-workspace" data-meo-desktop-parity="">
      <aside className={`meo-desktop-sidebar ${sidebarHidden ? 'is-hidden' : ''}`}>
        <div className="meo-desktop-brand">
          <div className="meo-desktop-logo">AI</div>
          <div className="meo-desktop-brand-copy">
            <strong>Meo AI</strong>
            <span>A little help. More possibility.</span>
          </div>
        </div>

        <button className="meo-desktop-nav meo-desktop-nav-primary" type="button" onClick={() => { setMode('chat'); setSettingsOpen(false); if (window.matchMedia('(max-width: 759px)').matches) setSidebarHidden(true); navigate('/new'); }}>
          <Icon name="add" /><span>New chat</span>
        </button>

        <nav className="meo-desktop-nav-list" aria-label="Meo AI">
          {uiNavigation.filter(item => item.placement === 'primary').map(item => (
            <button
              key={item.id}
              type="button"
              className={`meo-desktop-nav ${!settingsOpen && mode === item.id ? 'is-active' : ''}`}
              onClick={() => item.id === 'settings'
                ? setSettingsOpen(true)
                : selectMode(item.id)}
            >
              <Icon name={item.icon} /><span>{item.label}</span>
            </button>
          ))}
        </nav>

        {!settingsOpen && mode === 'chat' && (
          <div className="meo-desktop-current-chat">
            <span className="meo-desktop-section-label">This conversation</span>
            <button className="meo-desktop-nav is-active" type="button" onClick={() => selectMode('chat')}>
              <Icon name="chat" /><span>Current chat</span>
            </button>
          </div>
        )}

        <div className="meo-desktop-sidebar-spacer" />

        {uiNavigation.filter(item => item.placement === 'secondary').map(item => (
          <button key={item.id}
            className={`meo-desktop-nav ${item.id === 'settings' ? (settingsOpen ? 'is-active' : '') : (!settingsOpen && mode === item.id ? 'is-active' : '')}`}
            type="button"
            onClick={() => {
              if (item.id === 'settings') {
                setSettingsOpen(true);
                if (window.matchMedia('(max-width: 759px)').matches) setSidebarHidden(true);
                setInspectorOpen(false);
              } else {
                selectMode(item.id);
              }
            }}>
            <Icon name={item.icon} /><span>{item.label}</span>
          </button>
        ))}

        <div className="meo-desktop-device-card">
          <Icon name="computer" />
          <div>
            <strong>This browser</strong>
            <span>{accountLabel}</span>
          </div>
          <i aria-label="Connected" />
        </div>
      </aside>

      <section className="meo-desktop-main-pane">
        <header className="meo-desktop-header">
          <button
            className="meo-desktop-icon-button meo-desktop-sidebar-toggle"
            type="button"
            aria-label={sidebarHidden ? 'Show navigation' : 'Hide navigation'}
            onClick={() => setSidebarHidden((value) => !value)}
          >
            <Icon name="menu" />
          </button>
          <div className="meo-desktop-header-copy">
            <strong>{settingsOpen ? 'Settings' : mode === 'chat' ? 'Your space to think' : modeCopy[mode].title}</strong>
            <span>
              {settingsOpen
                ? 'Account preferences and memory'
                : mode === 'chat'
                ? 'Ready'
                : mode === 'work'
                  ? 'Choose where Meo AI can act'
                  : mode === 'projects'
                    ? 'Persistent context for related work'
                    : 'Reusable capabilities'}
            </span>
          </div>
          <button
            className={`meo-desktop-icon-button ${inspectorOpen ? 'is-active' : ''}`}
            type="button"
            aria-label="Response details and settings"
            onClick={() => setInspectorOpen((value) => !value)}
          >
            <Icon name="panel" />
          </button>
        </header>

        <div className="meo-desktop-content">
          {settingsOpen ? (
            <MeoPersonalizationSettings />
          ) : mode === 'chat' ? (
            <div className="meo-desktop-chat-host">
              <MeoChat />
            </div>
          ) : mode === 'projects' ? (
            <MeoProjects />
          ) : (
            <ModeLanding mode={mode} onOpenExisting={() => navigate(mode === 'projects' ? '/projects' : mode === 'skills' ? '/skills' : '/activity')} />
          )}
        </div>
      </section>

      {inspectorOpen && (
        <aside className="meo-desktop-inspector" aria-label="Response details and settings">
          <div className="meo-desktop-inspector-head">
            <div>
              <strong>Details</strong>
              <span>Response, tools, context and AI settings</span>
            </div>
            <button type="button" onClick={() => setInspectorOpen(false)} aria-label="Close details">×</button>
          </div>
          <div className="meo-desktop-inspector-tabs">
            <button className="is-active" type="button">Response</button>
            <button type="button">Tools</button>
            <button type="button">Context</button>
            <button type="button">AI</button>
          </div>
          <div className="meo-desktop-inspector-empty">
            <Icon name="panel" />
            <strong>Response details</strong>
            <span>Select a response to inspect timing, token usage, context, tools and reasoning.</span>
          </div>
        </aside>
      )}
    </div>
  );
}

function ModeLanding({ mode, onOpenExisting }: { mode: Exclude<PrimaryMode, 'chat'>; onOpenExisting: () => void }) {
  const copy = modeCopy[mode];
  return (
    <section className="meo-desktop-mode-landing">
      <div className="meo-desktop-mode-icon"><Icon name={copy.icon} /></div>
      <h1>{copy.title}</h1>
      <p>{copy.description}</p>
      {mode === 'work' && (
        <div className="meo-desktop-work-target">
          <Icon name="computer" />
          <div><strong>This computer</strong><span>Browser session is connected; native privileged actions require a paired device.</span></div>
          <i />
        </div>
      )}
      <button className="meo-desktop-open-existing" type="button" onClick={onOpenExisting}>
        Open {copy.title}
      </button>
    </section>
  );
}
