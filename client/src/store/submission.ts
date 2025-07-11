import { atom } from 'jotai';
import { TSubmission } from 'librechat-data-provider';

const submission = atom<TSubmission | null>(null);

const isSubmitting = atom<boolean>(false);

export default {
  submission,
  isSubmitting,
};
