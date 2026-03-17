import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { TContact, TContactPayload, TCSVImportResponse } from '../common/types/contacts';

// Axios instance to reuse baseUrl setup
const api = axios.create({
    withCredentials: true,
    baseURL: '/api/contacts',
});

api.interceptors.response.use(
    (response) => response.data,
    (error) => Promise.reject(error),
);

// Constants
export const QueryKeys = {
    contacts: 'contacts',
    contact: (id: string) => ['contact', id],
};

// API Functions
const getContacts = async (): Promise<TContact[]> => {
    return await api.get('/');
};

const getContact = async (id: string): Promise<TContact> => {
    return await api.get(`/${id}`);
};

const createContact = async (data: TContactPayload): Promise<TContact> => {
    return await api.post('/', data);
};

const updateContact = async ({
    id,
    data,
}: {
    id: string;
    data: Partial<TContactPayload>;
}): Promise<TContact> => {
    return await api.put(`/${id}`, data);
};

const deleteContact = async (id: string): Promise<void> => {
    return await api.delete(`/${id}`);
};

const importContactsCSV = async (file: File): Promise<TCSVImportResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    return await api.post('/import', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
};

// Hooks
export const useGetContacts = <TData = TContact[]>(options?: {
    select?: (data: TContact[]) => TData;
}) => {
    return useQuery({
        queryKey: [QueryKeys.contacts],
        queryFn: getContacts,
        ...options,
    });
};

export const useGetContactItem = (id: string, options?: any) => {
    return useQuery({
        queryKey: QueryKeys.contact(id),
        queryFn: () => getContact(id),
        enabled: !!id,
        ...options,
    });
};

export const useCreateContact = (options?: any) => {
    const queryClient = useQueryClient();
    return useMutation<TContact, unknown, TContactPayload>({
        mutationFn: (data: TContactPayload) => createContact(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QueryKeys.contacts] });
        },
        ...options,
    });
};

export const useUpdateContact = (options?: any) => {
    const queryClient = useQueryClient();
    return useMutation<TContact, unknown, { id: string; data: Partial<TContactPayload> }>({
        mutationFn: ({ id, data }: { id: string; data: Partial<TContactPayload> }) => updateContact({ id, data }),
        onSuccess: (data: any) => {
            queryClient.invalidateQueries({ queryKey: [QueryKeys.contacts] });
            queryClient.invalidateQueries({ queryKey: QueryKeys.contact(data._id) });
        },
        ...options,
    });
};

export const useDeleteContact = (options?: any) => {
    const queryClient = useQueryClient();
    return useMutation<void, unknown, string>({
        mutationFn: (id: string) => deleteContact(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QueryKeys.contacts] });
        },
        ...options,
    });
};

export const useImportContactsCSV = (options?: any) => {
    const queryClient = useQueryClient();
    return useMutation<TCSVImportResponse, unknown, File>({
        mutationFn: (file: File) => importContactsCSV(file),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QueryKeys.contacts] });
        },
        ...options,
    });
};
