/* eslint-disable i18next/no-literal-string */
import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { AddCandidateInput } from './types';

const WHATSAPP_REGEX = /^\+[1-9]\d{7,14}$/;

interface AddCandidateFormProps {
  open: boolean;
  onSubmit: (data: AddCandidateInput) => Promise<void>;
  onClose: () => void;
}

export default function AddCandidateForm({ open, onSubmit, onClose }: AddCandidateFormProps) {
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [errors, setErrors] = useState<{ name?: string; whatsapp?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Reset form when opened
  useEffect(() => {
    if (open) {
      setName('');
      setWhatsapp('');
      setErrors({});
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open]);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onClose(); };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: { name?: string; whatsapp?: string } = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!WHATSAPP_REGEX.test(whatsapp.trim())) errs.whatsapp = 'Enter a valid number (e.g. +39 333 1234567)';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), whatsapp: whatsapp.trim() });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-employee-title"
      >
        {/* Header */}
        <div className="mb-1 flex items-start justify-between">
          <h2 id="add-employee-title" className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Add New Employee
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-5 text-sm text-blue-500 dark:text-blue-400">
          Enter the name and WhatsApp number. The AI onboarding will handle the rest.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-900 dark:text-gray-100">
              Full Name
            </label>
            <input
              ref={nameRef}
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border-2 border-gray-900 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none dark:border-gray-200 dark:bg-gray-800 dark:text-gray-100"
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* WhatsApp Number */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-900 dark:text-gray-100">
              WhatsApp Number
            </label>
            <input
              type="text"
              placeholder="+39 333 1234567"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
            {errors.whatsapp && <p className="mt-1 text-xs text-red-500">{errors.whatsapp}</p>}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-xl bg-gray-500 py-3 text-sm font-semibold text-white hover:bg-gray-600 disabled:opacity-60"
            >
              {submitting ? 'Adding…' : 'Add & Start Onboarding'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
