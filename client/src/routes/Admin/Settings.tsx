import { useState, useEffect } from 'react';
import { useAuthContext } from '~/hooks/AuthContext';
import { useToastContext } from '@librechat/client';

interface SettingsData {
    message?: string;
    [key: string]: unknown;
}

interface ErrorResponse {
    message: string;
}

export default function Settings() {
    const { token } = useAuthContext();
    const { showToast } = useToastContext();
    const [settings, setSettings] = useState<SettingsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            fetchSettings();
        }
    }, [token]);

    const fetchSettings = async () => {
        if (!token) return;
        try {
            setLoading(true);
            const res = await fetch('/api/admin/settings', {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            if (res.ok) {
                const data = await res.json();
                setSettings(data);
            } else {
                const errorData = await res.json().catch(() => ({ message: 'Failed to fetch settings' }));
                showToast({ message: errorData.message || 'Failed to fetch settings', status: 'error' });
            }
        } catch (error) {
            showToast({ message: 'Error loading settings. Please try again.', status: 'error' });
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-4 text-text-primary">Loading...</div>;

    return (
        <div className="space-y-4 text-text-primary">
            <h1 className="text-2xl font-bold">App Settings</h1>
            <div className="rounded-lg border border-black/10 bg-surface-primary p-6 dark:border-white/10">
                <p className="text-text-secondary">
                    {settings?.message || 'Settings management coming soon.'}
                </p>
            </div>
        </div>
    );
}
