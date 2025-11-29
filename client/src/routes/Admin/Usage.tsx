import { useState, useEffect } from 'react';
import { useAuthContext } from '~/hooks/AuthContext';
import { useToastContext } from '@librechat/client';

interface TokenStats {
    totalTokens: number;
    count: number;
}

interface StatsData {
    totalTransactions: number;
    tokenStats: TokenStats;
}

interface ErrorResponse {
    message: string;
}

export default function Usage() {
    const { token } = useAuthContext();
    const { showToast } = useToastContext();
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            fetchStats();
        }
    }, [token]);

    const fetchStats = async () => {
        if (!token) return;
        try {
            setLoading(true);
            const res = await fetch('/api/admin/stats', {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            } else {
                const errorData = await res.json().catch(() => ({ message: 'Failed to fetch stats' }));
                showToast({ message: errorData.message || 'Failed to fetch stats', status: 'error' });
            }
        } catch (error) {
            showToast({ message: 'Error loading stats. Please try again.', status: 'error' });
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-4 text-text-primary">Loading...</div>;

    return (
        <div className="space-y-4 text-text-primary">
            <h1 className="text-2xl font-bold">Usage Statistics</h1>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-black/10 bg-surface-secondary p-6 dark:border-white/10">
                    <h3 className="text-lg font-medium text-text-secondary">Total Transactions</h3>
                    <p className="mt-2 text-3xl font-bold text-text-primary">{stats?.totalTransactions || 0}</p>
                </div>
                <div className="rounded-lg border border-black/10 bg-surface-secondary p-6 dark:border-white/10">
                    <h3 className="text-lg font-medium text-text-secondary">Total Token Usage</h3>
                    <p className="mt-2 text-3xl font-bold text-text-primary">{stats?.tokenStats?.totalTokens?.toLocaleString() || 0}</p>
                </div>
            </div>
        </div>
    );
}
