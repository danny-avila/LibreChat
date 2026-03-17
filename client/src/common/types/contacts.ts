export type TContact = {
    _id: string;
    user: string;
    name: string;
    company?: string;
    role?: string;
    email?: string;
    notes?: string;
    attributes?: Record<string, any>;
    createdAt: string;
    updatedAt: string;
};

export type TContactPayload = Omit<TContact, '_id' | 'user' | 'createdAt' | 'updatedAt'>;

export type TCSVImportResponse = {
    success: boolean;
    count: number;
};
