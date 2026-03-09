import React, { useState } from 'react';
import { X, Tag, ChevronDown, ChevronUp } from 'lucide-react';

interface ChangelogEntry {
    version: string;
    date: string;
    isCurrent?: boolean;
    highlights: string[];
    sections?: {
        title: string;
        items: string[];
    }[];
    workInProgress?: {
        title: string;
        items: string[];
    };
}

const CHANGELOG: ChangelogEntry[] = [
    {
        version: 'v1.3',
        date: 'March 9, 2026',
        isCurrent: true,
        highlights: ['Long-Term Memory', 'Admin rule management', 'Organisation-wide context'],
        sections: [
            {
                title: 'Long-Term Memory — Admin Controlled',
                items: [
                    'Admins can now create and manage persistent memory rules that apply across all conversations for every member in the organisation.',
                    'Memory rules are injected as context into every new or ongoing conversation, ensuring the AI agent always has relevant organisational knowledge.',
                    'Role-based access control ensures only Admin users can create and manage memory entries.',
                ],
            },
            {
                title: 'How to Add Memory Manually',
                items: [
                    'Open the right-side panel in chat.fleetworx.net and navigate to the Memory section.',
                    'Tap the + button to create a new memory entry.',
                    'Each entry has a Key (for identification, e.g. fleetworx_info, fleetworx_rules, fleetworx_client_summary) and a Value (the information to store).',
                    'Saved entries are immediately available to the AI agent as persistent context.',
                ],
            },
            {
                title: 'How to Add Memory Automatically',
                items: [
                    'Simply type "Please remember..." or "Please save..." in any conversation.',
                    'The agent will automatically extract the key and information and save it as a memory entry.',
                    'No manual panel interaction required — memory is built conversationally.',
                ],
            },
        ],
    },
    {
        version: 'v1.2',
        date: 'February 24, 2026',
        highlights: ['Text-to-SQL Query Load Management'],
        sections: [
            {
                title: 'Text-to-SQL Query Load Management',
                items: [
                    'This enhancement ensures system stability when handling large datasets.',
                    'If a generated query results in excessive data or exceeds processing limits, the agent will gracefully terminate the execution and prompt the user to narrow the date range or refine the query.',
                ],
            },
        ],
    },
    {
        version: 'v1.1',
        date: 'February 18, 2026',
        highlights: ['Short-term memory', 'Improved date & time calculations', 'Live environment deployment'],
        sections: [
            {
                title: 'What\'s New',
                items: [
                    'Deployed the "Fleetworx AI Dev" agent to the live "Fleetworx AI" environment. The Fleetworx team no longer needs to switch to the Dev agent.',
                    'Short-term memory implementation – You can now ask follow-up questions within the same chat thread, and the agent will retain the conversation context.',
                    'Improved date and time-based calculations – For example, if you ask "Provide the cost summary of last month," the agent will automatically calculate the correct date range. The same logic applies to queries such as last week, last 3 months, etc.',
                ],
            },
        ],
    },
    {
        version: 'v1.0',
        date: 'January 16, 2026',
        highlights: ['Initial release of Fleetworx AI'],
        sections: [
            {
                title: 'Initial Release',
                items: [
                    'First public release of the Fleetworx AI agent.',
                    'Natural language querying for fleet data.',
                    'Core Text-to-SQL capabilities for fleet management insights.',
                ],
            },
        ],
    },
];

const CURRENT_VERSION = CHANGELOG.find((e) => e.isCurrent)?.version ?? 'v1.2';

interface VersionBadgeProps {
    version: string;
    isCurrent?: boolean;
}

function VersionBadge({ version, isCurrent }: VersionBadgeProps) {
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${isCurrent
                ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/40'
                : 'bg-surface-secondary text-text-secondary ring-1 ring-border-medium'
                }`}
        >
            <Tag size={10} />
            {version}
            {isCurrent && <span className="ml-1 font-normal opacity-75">current</span>}
        </span>
    );
}

interface ChangelogCardProps {
    entry: ChangelogEntry;
    defaultOpen?: boolean;
}

function ChangelogCard({ entry, defaultOpen = false }: ChangelogCardProps) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div
            className={`rounded-xl border transition-all duration-200 ${entry.isCurrent
                ? 'border-green-500/30 bg-green-500/5'
                : 'border-border-medium bg-surface-secondary'
                }`}
        >
            {/* Header */}
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                aria-expanded={open}
            >
                <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <VersionBadge version={entry.version} isCurrent={entry.isCurrent} />
                    <span className="truncate text-sm font-medium text-text-primary">{entry.date}</span>
                </div>
                <div className="ml-2 flex shrink-0 items-center">
                    {open ? (
                        <ChevronUp size={16} className="text-text-secondary" />
                    ) : (
                        <ChevronDown size={16} className="text-text-secondary" />
                    )}
                </div>
            </button>

            {/* Body */}
            {open && (
                <div className="border-t border-border-medium px-5 pb-5 pt-4">
                    {entry.sections?.map((section) => (
                        <div key={section.title} className="mb-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                                {section.title}
                            </p>
                            <ul className="space-y-2">
                                {section.items.map((item, i) => (
                                    <li key={i} className="flex gap-2 text-sm text-text-primary">
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}

                    {entry.workInProgress && (
                        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                                🚧 {entry.workInProgress.title}
                            </p>
                            <ul className="space-y-2">
                                {entry.workInProgress.items.map((item, i) => (
                                    <li key={i} className="flex gap-2 text-sm text-amber-200/80">
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

interface ChangelogModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ChangelogModal({ isOpen, onClose }: ChangelogModalProps) {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Changelog"
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Modal */}
            <div
                className="relative z-10 flex w-full max-w-xl flex-col rounded-2xl border border-border-medium bg-surface-primary shadow-2xl"
                style={{ maxHeight: '85vh' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border-medium px-6 py-4">
                    <div>
                        <h2 className="text-base font-semibold text-text-primary">Changelog</h2>
                        <p className="text-xs text-text-secondary">Fleetworx AI release history</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                        aria-label="Close changelog"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <div className="flex flex-col gap-3">
                        {CHANGELOG.map((entry, index) => (
                            <ChangelogCard key={entry.version} entry={entry} defaultOpen={index === 0} />
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-border-medium px-6 py-3 text-center text-xs text-text-secondary">
                    Current version: <span className="font-semibold text-text-primary">{CURRENT_VERSION}</span>
                </div>
            </div>
        </div>
    );
}

export { CURRENT_VERSION };
