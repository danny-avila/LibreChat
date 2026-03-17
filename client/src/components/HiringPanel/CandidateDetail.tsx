/* eslint-disable i18next/no-literal-string */
import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Check,
  X,
  Upload,
  ArrowLeft,
} from 'lucide-react';
import type { Candidate, OnboardingStatus } from './types';

// ── helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const STATUS_OPTIONS: OnboardingStatus[] = ['pending', 'onboarding', 'active'];

const STATUS_BADGE: Record<OnboardingStatus, string> = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  onboarding: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};

// ── Section wrapper ───────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  children: React.ReactNode;
  onEdit: () => void;
  editing: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function Section({ title, children, onEdit, editing, onSave, onCancel }: SectionProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/50">
      <div className="flex items-center justify-between px-5 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100"
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {title}
        </button>
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button
                onClick={onSave}
                className="flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
              >
                <Check className="h-3 w-3" /> Save
              </button>
              <button
                onClick={onCancel}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <X className="h-3 w-3" /> Cancel
              </button>
            </>
          ) : (
            <button
              onClick={onEdit}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {open && <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-700">{children}</div>}
    </div>
  );
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function Field({ label, value, editing, onChange }: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-400 dark:text-gray-500">{label}</span>
      {editing ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
      ) : (
        <span className="text-sm text-gray-800 dark:text-gray-200">{value || '—'}</span>
      )}
    </div>
  );
}

function TextareaField({ label, value, editing, onChange }: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-400 dark:text-gray-500">{label}</span>
      {editing ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
      ) : (
        <span className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">{value || '—'}</span>
      )}
    </div>
  );
}

// ── Document slot ─────────────────────────────────────────────────────────────

function DocSlot({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-dashed border-gray-300 px-4 py-3 dark:border-gray-600">
      <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
      {value ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          View
        </a>
      ) : (
        <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <Upload className="h-3.5 w-3.5" /> Upload
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface CandidateDetailProps {
  candidate: Candidate;
  onBack: () => void;
  onUpdate: (patch: Partial<Candidate>) => Promise<Candidate | null>;
}

export default function CandidateDetail({ candidate, onBack, onUpdate }: CandidateDetailProps) {
  const [statusOpen, setStatusOpen] = useState(false);

  // Per-section draft state
  const [contactDraft, setContactDraft] = useState({
    name: candidate.name,
    whatsapp: candidate.whatsapp,
    companyEmail: candidate.companyEmail ?? '',
    phone: candidate.phone ?? '',
    personalEmail: candidate.personalEmail ?? '',
    address: candidate.address ?? '',
  });
  const [editingContact, setEditingContact] = useState(false);

  const [notesDraft, setNotesDraft] = useState(candidate.notes ?? '');
  const [editingNotes, setEditingNotes] = useState(false);

  const [roleDraft, setRoleDraft] = useState({
    role: candidate.role ?? '',
    descriptionGoals: candidate.descriptionGoals ?? '',
    skills: (candidate.skills ?? []).join(', '),
  });
  const [editingRole, setEditingRole] = useState(false);

  const [financialDraft, setFinancialDraft] = useState({
    monthlySalary: candidate.monthlySalary ?? '',
    currency: candidate.currency ?? 'USD',
  });
  const [editingFinancial, setEditingFinancial] = useState(false);

  const [socialDraft, setSocialDraft] = useState({
    linkedin: candidate.socialMedia?.linkedin ?? '',
    instagram: candidate.socialMedia?.instagram ?? '',
    twitter: candidate.socialMedia?.twitter ?? '',
    facebook: candidate.socialMedia?.facebook ?? '',
    telegram: candidate.socialMedia?.telegram ?? '',
    website: candidate.socialMedia?.website ?? '',
  });
  const [editingSocial, setEditingSocial] = useState(false);

  const [driveDraft, setDriveDraft] = useState(candidate.googleDriveFolder ?? '');
  const [editingDrive, setEditingDrive] = useState(false);

  // ── save helpers ────────────────────────────────────────────────────────────

  const saveContact = async () => {
    await onUpdate(contactDraft);
    setEditingContact(false);
  };
  const saveNotes = async () => {
    await onUpdate({ notes: notesDraft });
    setEditingNotes(false);
  };
  const saveRole = async () => {
    await onUpdate({
      role: roleDraft.role,
      descriptionGoals: roleDraft.descriptionGoals,
      skills: roleDraft.skills.split(',').map((s) => s.trim()).filter(Boolean),
    });
    setEditingRole(false);
  };
  const saveFinancial = async () => {
    await onUpdate(financialDraft);
    setEditingFinancial(false);
  };
  const saveSocial = async () => {
    await onUpdate({ socialMedia: socialDraft });
    setEditingSocial(false);
  };
  const saveDrive = async () => {
    await onUpdate({ googleDriveFolder: driveDraft });
    setEditingDrive(false);
  };

  const cancelContact = () => {
    setContactDraft({
      name: candidate.name,
      whatsapp: candidate.whatsapp,
      companyEmail: candidate.companyEmail ?? '',
      phone: candidate.phone ?? '',
      personalEmail: candidate.personalEmail ?? '',
      address: candidate.address ?? '',
    });
    setEditingContact(false);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-gray-50 dark:bg-gray-900">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      {/* Profile header */}
      <div className="flex items-center gap-5 bg-white px-6 py-6 dark:bg-gray-800">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xl font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          {getInitials(candidate.name)}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{candidate.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{candidate.whatsapp}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{candidate.role || 'No role set'}</p>
        </div>
        {/* Status dropdown */}
        <div className="relative">
          <button
            onClick={() => setStatusOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${STATUS_BADGE[candidate.status]}`}
          >
            {candidate.status.charAt(0).toUpperCase() + candidate.status.slice(1)}
            <ChevronDown className="h-3 w-3" />
          </button>
          {statusOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={async () => {
                    await onUpdate({ status: s });
                    setStatusOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className="flex flex-col gap-4 p-6">
        {/* Contact Details */}
        <Section
          title="Contact Details"
          editing={editingContact}
          onEdit={() => setEditingContact(true)}
          onSave={saveContact}
          onCancel={cancelContact}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full Name" value={contactDraft.name} editing={editingContact} onChange={(v) => setContactDraft((d) => ({ ...d, name: v }))} />
            <Field label="WhatsApp" value={contactDraft.whatsapp} editing={editingContact} onChange={(v) => setContactDraft((d) => ({ ...d, whatsapp: v }))} />
            <Field label="Company Email" value={contactDraft.companyEmail} editing={editingContact} onChange={(v) => setContactDraft((d) => ({ ...d, companyEmail: v }))} />
            <Field label="Phone" value={contactDraft.phone} editing={editingContact} onChange={(v) => setContactDraft((d) => ({ ...d, phone: v }))} />
            <Field label="Personal Email" value={contactDraft.personalEmail} editing={editingContact} onChange={(v) => setContactDraft((d) => ({ ...d, personalEmail: v }))} />
            <Field label="Address" value={contactDraft.address} editing={editingContact} onChange={(v) => setContactDraft((d) => ({ ...d, address: v }))} />
          </div>
        </Section>

        {/* Personality & Notes */}
        <Section
          title="Personality & Notes"
          editing={editingNotes}
          onEdit={() => setEditingNotes(true)}
          onSave={saveNotes}
          onCancel={() => { setNotesDraft(candidate.notes ?? ''); setEditingNotes(false); }}
        >
          <TextareaField label="Notes" value={notesDraft} editing={editingNotes} onChange={setNotesDraft} />
        </Section>

        {/* Role & Skills */}
        <Section
          title="Role & Skills"
          editing={editingRole}
          onEdit={() => setEditingRole(true)}
          onSave={saveRole}
          onCancel={() => { setRoleDraft({ role: candidate.role ?? '', descriptionGoals: candidate.descriptionGoals ?? '', skills: (candidate.skills ?? []).join(', ') }); setEditingRole(false); }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role" value={roleDraft.role} editing={editingRole} onChange={(v) => setRoleDraft((d) => ({ ...d, role: v }))} />
            <Field label="Skills (comma-separated)" value={roleDraft.skills} editing={editingRole} onChange={(v) => setRoleDraft((d) => ({ ...d, skills: v }))} />
          </div>
          <div className="mt-4">
            <TextareaField label="Description & Goals" value={roleDraft.descriptionGoals} editing={editingRole} onChange={(v) => setRoleDraft((d) => ({ ...d, descriptionGoals: v }))} />
          </div>
        </Section>

        {/* Financial */}
        <Section
          title="Financial"
          editing={editingFinancial}
          onEdit={() => setEditingFinancial(true)}
          onSave={saveFinancial}
          onCancel={() => { setFinancialDraft({ monthlySalary: candidate.monthlySalary ?? '', currency: candidate.currency ?? 'USD' }); setEditingFinancial(false); }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Monthly Salary" value={financialDraft.monthlySalary} editing={editingFinancial} onChange={(v) => setFinancialDraft((d) => ({ ...d, monthlySalary: v }))} />
            <Field label="Currency" value={financialDraft.currency} editing={editingFinancial} onChange={(v) => setFinancialDraft((d) => ({ ...d, currency: v }))} />
          </div>
        </Section>

        {/* Documents */}
        <Section
          title="Documents"
          editing={false}
          onEdit={() => {}}
          onSave={() => {}}
          onCancel={() => {}}
        >
          <div className="flex flex-col gap-3">
            <DocSlot label="ID Card" value={candidate.documents?.idCard} />
            <DocSlot label="Passport" value={candidate.documents?.passport} />
            <DocSlot label="Employment Contract" value={candidate.documents?.employmentContract} />
          </div>
        </Section>

        {/* Social Media */}
        <Section
          title="Social Media"
          editing={editingSocial}
          onEdit={() => setEditingSocial(true)}
          onSave={saveSocial}
          onCancel={() => { setSocialDraft({ linkedin: candidate.socialMedia?.linkedin ?? '', instagram: candidate.socialMedia?.instagram ?? '', twitter: candidate.socialMedia?.twitter ?? '', facebook: candidate.socialMedia?.facebook ?? '', telegram: candidate.socialMedia?.telegram ?? '', website: candidate.socialMedia?.website ?? '' }); setEditingSocial(false); }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="LinkedIn" value={socialDraft.linkedin} editing={editingSocial} onChange={(v) => setSocialDraft((d) => ({ ...d, linkedin: v }))} />
            <Field label="Instagram" value={socialDraft.instagram} editing={editingSocial} onChange={(v) => setSocialDraft((d) => ({ ...d, instagram: v }))} />
            <Field label="Twitter / X" value={socialDraft.twitter} editing={editingSocial} onChange={(v) => setSocialDraft((d) => ({ ...d, twitter: v }))} />
            <Field label="Facebook" value={socialDraft.facebook} editing={editingSocial} onChange={(v) => setSocialDraft((d) => ({ ...d, facebook: v }))} />
            <Field label="Telegram" value={socialDraft.telegram} editing={editingSocial} onChange={(v) => setSocialDraft((d) => ({ ...d, telegram: v }))} />
            <Field label="Website" value={socialDraft.website} editing={editingSocial} onChange={(v) => setSocialDraft((d) => ({ ...d, website: v }))} />
          </div>
        </Section>

        {/* Google Drive */}
        <Section
          title="Google Drive"
          editing={editingDrive}
          onEdit={() => setEditingDrive(true)}
          onSave={saveDrive}
          onCancel={() => { setDriveDraft(candidate.googleDriveFolder ?? ''); setEditingDrive(false); }}
        >
          <Field label="Folder URL" value={driveDraft} editing={editingDrive} onChange={setDriveDraft} />
        </Section>
      </div>
    </div>
  );
}
