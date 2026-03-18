import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationOptions } from '@tanstack/react-query';

const CONTACTS_KEY = 'contacts';

export interface Contact {
  _id: string;
  name: string;
  company?: string;
  role?: string;
  email?: string;
  notes?: string;
  attributes?: Record<string, string>;
  createdAt: string;
}

export interface ContactsResponse {
  contacts: Contact[];
  total: number;
  page: number;
  pages: number;
}

export interface ContactsQueryParams {
  page?: number;
  limit?: number;
  search?: string;
}

const buildQuery = (params: ContactsQueryParams) => {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.search) q.set('search', params.search);
  return q.toString();
};

export const useContactsQuery = (params: ContactsQueryParams = {}) =>
  useQuery(
    [CONTACTS_KEY, params],
    () => axios.get(`/api/contacts?${buildQuery(params)}`).then((r) => r.data),
    { refetchOnWindowFocus: false },
  );

export const useContactQuery = (id: string) =>
  useQuery(
    [CONTACTS_KEY, id],
    () => axios.get(`/api/contacts/${id}`).then((r) => r.data),
    { enabled: !!id, refetchOnWindowFocus: false },
  );

export const useCreateContactMutation = (
  options?: UseMutationOptions<Contact, Error, Partial<Contact>>,
) => {
  const queryClient = useQueryClient();
  return useMutation(
    (data: Partial<Contact>) => axios.post('/api/contacts', data).then((r) => r.data),
    {
      ...options,
      onSuccess: (...args) => {
        queryClient.invalidateQueries([CONTACTS_KEY]);
        options?.onSuccess?.(...args);
      },
    },
  );
};

export const useUpdateContactMutation = (
  options?: UseMutationOptions<Contact, Error, { id: string; data: Partial<Contact> }>,
) => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ id, data }: { id: string; data: Partial<Contact> }) =>
      axios.put(`/api/contacts/${id}`, data).then((r) => r.data),
    {
      ...options,
      onSuccess: (...args) => {
        queryClient.invalidateQueries([CONTACTS_KEY]);
        options?.onSuccess?.(...args);
      },
    },
  );
};

export const useDeleteContactMutation = (options?: UseMutationOptions<void, Error, string>) => {
  const queryClient = useQueryClient();
  return useMutation(
    (id: string) => axios.delete(`/api/contacts/${id}`).then((r) => r.data),
    {
      ...options,
      onSuccess: (...args) => {
        queryClient.invalidateQueries([CONTACTS_KEY]);
        options?.onSuccess?.(...args);
      },
    },
  );
};

export const useImportContactsMutation = (
  options?: UseMutationOptions<{ imported: number; errors: number }, Error, File>,
) => {
  const queryClient = useQueryClient();
  return useMutation(
    (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return axios
        .post('/api/contacts/import', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data);
    },
    {
      ...options,
      onSuccess: (...args) => {
        queryClient.invalidateQueries([CONTACTS_KEY]);
        options?.onSuccess?.(...args);
      },
    },
  );
};