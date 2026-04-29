import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Users, X, Bot, Loader2 } from 'lucide-react';
import { Button, FilterInput, Spinner, useToastContext } from '@librechat/client';
import type { TContact, TContactRequest } from 'librechat-data-provider';
import {
  useContactsQuery,
  useCreateContactMutation,
  useDeleteContactMutation,
  useUpdateContactMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import ContactDialog from '~/components/Contacts/ContactDialog';

const pageSize = 10;

// ---------------------------------------------------------------------------
// SSE stream reader
// Backend sends:  data: "json-encoded-chunk"\n\n
//                 data: [DONE]\n\n
// We split the raw text on \n, find lines starting with "data: ",
// JSON.parse the payload (or detect [DONE]).
// ---------------------------------------------------------------------------
async function streamContactSummary(
  contactId: string,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: () => void,
) {
  try {
    const res = await fetch(`/api/contacts/${contactId}/ai-summary-stream`);
    if (!res.ok || !res.body) throw new Error('Stream failed');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process all complete lines in the buffer
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim(); // everything after "data:"

        if (payload === '[DONE]') {
          onDone();
          return;
        }

        if (!payload) continue;

        try {
          // Backend JSON.stringified the chunk, so parse it back
          const text = JSON.parse(payload) as string;
          onChunk(text);
        } catch {
          // If somehow not JSON, just use raw
          onChunk(payload);
        }
      }
    }

    onDone();
  } catch (err) {
    console.error('SSE error:', err);
    onError();
  }
}

export default function Contacts() {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeContact, setActiveContact] = useState<TContact | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<TContact | null>(null);

  const [aiTarget, setAiTarget] = useState<TContact | null>(null);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStarted, setAiStarted] = useState(false);
  const aiScrollRef = useRef<HTMLDivElement>(null);

  const deferredSearch = useDeferredValue(search);

  const query = useContactsQuery({
    search: deferredSearch || undefined,
    page,
    limit: pageSize,
  });

  const createMutation = useCreateContactMutation();
  const updateMutation = useUpdateContactMutation();
  const deleteMutation = useDeleteContactMutation();

  const contacts = query.data?.data ?? [];

  const totalPages = useMemo(() => {
    const total = query.data?.total ?? 0;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [query.data?.total]);

  useEffect(() => setPage(1), [deferredSearch]);

  useEffect(() => {
    if (query.isError) {
      showToast({ message: 'Something went wrong loading contacts.', status: 'error' });
    }
  }, [query.isError, showToast]);

  // Auto-scroll AI box as text streams in
  useEffect(() => {
    if (aiScrollRef.current) {
      aiScrollRef.current.scrollTop = aiScrollRef.current.scrollHeight;
    }
  }, [aiText]);

  const handleOpenCreate = () => {
    setActiveContact(undefined);
    setEditorOpen(true);
  };

  const handleOpenEdit = (contact: TContact) => {
    setActiveContact(contact);
    setEditorOpen(true);
  };

  const handleSave = async (data: TContactRequest) => {
    if (activeContact) {
      await updateMutation.mutateAsync({ contactId: activeContact._id, data });
      showToast({ message: localize('com_ui_contacts_update_success') });
      return;
    }
    await createMutation.mutateAsync(data);
    showToast({ message: localize('com_ui_contacts_create_success') });
  };

  const handleOpenAI = (contact: TContact) => {
    setAiTarget(contact);
    setAiText('');
    setAiStarted(false);
    setAiLoading(false);
  };

  const handleCloseAI = () => {
    setAiTarget(null);
    setAiText('');
    setAiStarted(false);
    setAiLoading(false);
  };

  const handleStartAI = (contact: TContact) => {
    setAiLoading(true);
    setAiStarted(true);
    setAiText('');

    streamContactSummary(
      contact._id,
      (chunk) => setAiText((prev) => prev + chunk),
      () => setAiLoading(false),
      () => {
        setAiLoading(false);
        showToast({ message: 'Failed to get AI response.', status: 'error' });
      },
    );
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border-light bg-surface-primary p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-surface-secondary text-text-primary">
            <Users className="size-5" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary">
            {localize('com_ui_contacts')}
          </h1>
        </div>
        <Button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          <Plus className="size-4" />
          {localize('com_ui_contacts_new') ?? 'New Contact'}
        </Button>
      </div>

      {/* ── Search ── */}
      <FilterInput
        inputId="contacts-filter"
        label={localize('com_ui_contacts_search') ?? 'Search contacts…'}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        containerClassName="w-full"
        className="text-black dark:text-white"
      />

      {/* ── Table ── */}
      {query.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-text-secondary">
          <Users className="size-10 opacity-30" />
          <p>No contacts found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-light">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border-light bg-surface-secondary text-left text-xs font-medium uppercase tracking-wide text-text-secondary">
                <th className="w-1/4 px-4 py-3">Name</th>
                <th className="w-1/4 px-4 py-3">Company</th>
                <th className="w-1/4 px-4 py-3">Tags</th>
                <th className="w-1/4 px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light bg-surface-primary">
              {contacts.map((contact) => (
                <tr key={contact._id} className="transition-colors hover:bg-surface-secondary">
                  <td className="px-4 py-3 font-medium text-text-primary">{contact.name}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {contact.company || <span className="opacity-40">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {(contact.tags ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(contact.tags ?? []).map((tag) => (
                          <span
                            key={tag}
                            className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="opacity-40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenEdit(contact)}
                        className="flex items-center gap-1.5 rounded-lg border border-border-light bg-surface-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-tertiary"
                      >
                        <Pencil className="size-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(contact)}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/50"
                      >
                        <Trash2 className="size-3" />
                        Delete
                      </button>
                      <button
                        onClick={() => handleOpenAI(contact)}
                        className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-900/50"
                      >
                        <Bot className="size-3" />
                        Ask AI
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {!query.isLoading && contacts.length > 0 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-border-light bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-tertiary disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-sm text-text-secondary">
            Page{' '}
            <span className="font-semibold text-text-primary">{page}</span>
            {' / '}
            <span className="font-semibold text-text-primary">{totalPages}</span>
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-border-light bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-tertiary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

      {/* ── Delete Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border-light bg-surface-primary p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-950/50">
                <Trash2 className="size-5 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-base font-semibold text-text-primary">Delete contact?</h2>
            </div>
            <p className="mb-6 text-sm text-text-secondary">
              <strong className="text-text-primary">{deleteTarget.name}</strong> will be
              permanently removed. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-border-light bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-tertiary"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await deleteMutation.mutateAsync(deleteTarget._id);
                  showToast({ message: 'Contact deleted.' });
                  setDeleteTarget(null);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ask AI Modal ── */}
      {aiTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-lg flex-col rounded-2xl border border-border-light bg-surface-primary shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border-light px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                  {aiTarget.name
                    .split(' ')
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-text-primary">{aiTarget.name}</p>
                  {aiTarget.company && (
                    <p className="text-xs text-text-secondary">{aiTarget.company}</p>
                  )}
                </div>
              </div>
              <button
                onClick={handleCloseAI}
                className="rounded-lg p-1.5 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Contact details (hidden once AI starts) */}
            {!aiStarted && (
              <div className="px-6 py-5">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border-light">
                    {aiTarget.role && (
                      <tr>
                        <td className="w-20 py-2 pr-4 text-text-secondary">Role</td>
                        <td className="py-2 font-medium text-text-primary">{aiTarget.role}</td>
                      </tr>
                    )}
                    {aiTarget.email && (
                      <tr>
                        <td className="w-20 py-2 pr-4 text-text-secondary">Email</td>
                        <td className="py-2 font-medium text-text-primary break-all">{aiTarget.email}</td>
                      </tr>
                    )}
                    {aiTarget.phone && (
                      <tr>
                        <td className="w-20 py-2 pr-4 text-text-secondary">Phone</td>
                        <td className="py-2 font-medium text-text-primary">{aiTarget.phone}</td>
                      </tr>
                    )}
                    {(aiTarget.tags ?? []).length > 0 && (
                      <tr>
                        <td className="w-20 py-2 pr-4 align-top text-text-secondary">Tags</td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {(aiTarget.tags ?? []).map((tag) => (
                              <span
                                key={tag}
                                className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                    {aiTarget.notes && (
                      <tr>
                        <td className="w-20 py-2 pr-4 align-top text-text-secondary">Notes</td>
                        <td className="py-2 font-medium text-text-primary whitespace-pre-line">
                          {aiTarget.notes}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Streaming response */}
            {aiStarted && (
              <div
                ref={aiScrollRef}
                className="mx-6 my-4 max-h-72 overflow-y-auto rounded-xl border border-border-light bg-surface-secondary p-4 text-sm leading-relaxed text-text-primary"
              >
                {aiText ? (
                  <span className="whitespace-pre-wrap">{aiText}</span>
                ) : (
                  <span className="flex items-center gap-2 text-text-secondary">
                    <Loader2 className="size-4 animate-spin" />
                    Thinking…
                  </span>
                )}
                {/* blinking cursor while streaming */}
                {aiLoading && aiText && (
                  <span className="ml-0.5 inline-block h-[1em] w-0.5 animate-pulse bg-current align-middle" />
                )}
              </div>
            )}

            {/* Footer */}
            <div className="rounded-b-2xl border-t border-border-light bg-surface-secondary px-6 py-4">
              {!aiStarted ? (
                <>
                  <p className="mb-3 text-xs text-text-secondary">
                    AI will summarise this contact and suggest next steps — right here.
                  </p>
                  <button
                    onClick={() => handleStartAI(aiTarget)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    <Bot className="size-4" />
                    Ask AI about {aiTarget.name}
                  </button>
                </>
              ) : aiLoading ? (
                <p className="text-center text-xs text-text-secondary">
                  <Loader2 className="mr-1 inline size-3 animate-spin" />
                  Generating response…
                </p>
              ) : (
                <button
                  onClick={handleCloseAI}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-light bg-surface-primary px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ContactDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        contact={activeContact}
        onSubmit={handleSave}
        onError={() => showToast({ message: 'Something went wrong.', status: 'error' })}
      />
    </div>
  );
}