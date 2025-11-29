import { useState, useEffect } from 'react';
import { useAuthContext } from '~/hooks/AuthContext';
import { OGDialog, DialogTemplate, useToastContext } from '@librechat/client';

interface User {
    _id: string;
    name: string;
    username: string;
    email: string;
    role: string;
    createdAt: string;
}

interface UsersResponse {
    users: User[];
    currentPage: number;
    totalPages: number;
    totalUsers: number;
}

interface ErrorResponse {
    message: string;
}

export default function Users() {
    const { token } = useAuthContext();
    const { showToast } = useToastContext();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [error, setError] = useState<string | null>(null);

    // Modal State
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [userToDelete, setUserToDelete] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        username: '',
        email: '',
        password: '',
        role: 'USER',
    });

    useEffect(() => {
        if (token) {
            fetchUsers();
        }
    }, [page, token]);

    const fetchUsers = async () => {
        if (!token) return;
        try {
            setLoading(true);
            setError(null);
            const res = await fetch(`/api/admin/users?page=${page}&limit=10`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users || []);
                setTotalPages(data.totalPages || 1);
            } else {
                const errorData = await res.json().catch(() => ({ message: 'Failed to fetch users' }));
                setError(errorData.message || 'Failed to fetch users');
                showToast({ message: errorData.message || 'Failed to fetch users', status: 'error' });
            }
        } catch (error) {
            const errorMessage = 'Failed to fetch users. Please try again.';
            setError(errorMessage);
            showToast({ message: errorMessage, status: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const validateForm = (isCreating = false): boolean => {
        if (!formData.email || !formData.username) {
            showToast({ message: 'Email and username are required', status: 'error' });
            return false;
        }

        if (isCreating && !formData.password) {
            showToast({ message: 'Password is required', status: 'error' });
            return false;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            showToast({ message: 'Please enter a valid email address', status: 'error' });
            return false;
        }

        // Password validation for new users
        if (isCreating && formData.password.length < 8) {
            showToast({ message: 'Password must be at least 8 characters long', status: 'error' });
            return false;
        }

        // Username validation
        if (formData.username.length < 3) {
            showToast({ message: 'Username must be at least 3 characters long', status: 'error' });
            return false;
        }

        return true;
    };

    const handleCreateUser = async () => {
        if (!token) return;
        if (!validateForm(true)) return;

        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });
            if (res.ok) {
                setIsCreateOpen(false);
                fetchUsers();
                setFormData({ name: '', username: '', email: '', password: '', role: 'USER' });
                showToast({ message: 'User created successfully', status: 'success' });
            } else {
                const errorData = await res.json().catch(() => ({ message: 'Failed to create user' }));
                showToast({ message: errorData.message || 'Failed to create user', status: 'error' });
            }
        } catch (error) {
            showToast({ message: 'Error creating user. Please try again.', status: 'error' });
        }
    };

    const handleUpdateUser = async () => {
        if (!token || !selectedUser) return;
        if (!validateForm(false)) return;

        try {
            const res = await fetch(`/api/admin/users/${selectedUser._id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: formData.name,
                    username: formData.username,
                    email: formData.email,
                    role: formData.role,
                }),
            });
            if (res.ok) {
                setIsEditOpen(false);
                fetchUsers();
                setSelectedUser(null);
                showToast({ message: 'User updated successfully', status: 'success' });
            } else {
                const errorData = await res.json().catch(() => ({ message: 'Failed to update user' }));
                showToast({ message: errorData.message || 'Failed to update user', status: 'error' });
            }
        } catch (error) {
            showToast({ message: 'Error updating user. Please try again.', status: 'error' });
        }
    };

    const openDeleteModal = (id: string) => {
        setUserToDelete(id);
        setIsDeleteOpen(true);
    };

    const handleDeleteUser = async () => {
        if (!token || !userToDelete) return;
        try {
            const res = await fetch(`/api/admin/users/${userToDelete}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
            if (res.ok) {
                setIsDeleteOpen(false);
                setUserToDelete(null);
                fetchUsers();
                showToast({ message: 'User deleted successfully', status: 'success' });
            } else {
                const errorData = await res.json().catch(() => ({ message: 'Failed to delete user' }));
                showToast({ message: errorData.message || 'Failed to delete user', status: 'error' });
            }
        } catch (error) {
            showToast({ message: 'Error deleting user. Please try again.', status: 'error' });
        }
    };

    const openEditModal = (user: User) => {
        setSelectedUser(user);
        setFormData({
            name: user.name,
            username: user.username,
            email: user.email,
            password: '', // Password not editable directly here for now
            role: user.role,
        });
        setIsEditOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-text-primary">User Management</h2>
                <button
                    onClick={() => {
                        setFormData({ name: '', username: '', email: '', password: '', role: 'USER' });
                        setIsCreateOpen(true);
                    }}
                    className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                    Create User
                </button>
            </div>

            {loading ? (
                <div className="text-text-secondary">Loading users...</div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
                    <table className="min-w-full divide-y divide-black/10 dark:divide-white/10">
                        <thead className="bg-surface-tertiary">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Email</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Role</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Created At</th>
                                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-secondary">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/10 bg-surface-primary dark:divide-white/10">
                            {users.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-4 text-center text-sm text-text-secondary">
                                        No users found.
                                    </td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user._id}>
                                        <td className="whitespace-nowrap px-6 py-4 text-sm text-text-primary">{user.name || user.username}</td>
                                        <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">{user.email}</td>
                                        <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                                            <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${user.role === 'ADMIN' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">{new Date(user.createdAt).toLocaleDateString()}</td>
                                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                                            <button
                                                onClick={() => openEditModal(user)}
                                                className="mr-4 text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => openDeleteModal(user._id)}
                                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            <div className="flex justify-center space-x-2">
                <button
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="rounded px-3 py-1 bg-surface-secondary disabled:opacity-50"
                >
                    Previous
                </button>
                <span className="self-center text-text-secondary">Page {page} of {totalPages}</span>
                <button
                    disabled={page === totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="rounded px-3 py-1 bg-surface-secondary disabled:opacity-50"
                >
                    Next
                </button>
            </div>

            {/* Create User Modal */}
            <OGDialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTemplate
                    title="Create User"
                    className="w-full max-w-lg"
                    showCloseButton={true}
                    showCancelButton={false}
                    main={
                        <div className="space-y-4 p-4">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="mt-1 block w-full rounded-md border border-gray-300 bg-surface-primary px-3 py-2 text-text-primary focus:border-green-500 focus:outline-none focus:ring-green-500 dark:border-gray-600"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">Username</label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    className="mt-1 block w-full rounded-md border border-gray-300 bg-surface-primary px-3 py-2 text-text-primary focus:border-green-500 focus:outline-none focus:ring-green-500 dark:border-gray-600"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="mt-1 block w-full rounded-md border border-gray-300 bg-surface-primary px-3 py-2 text-text-primary focus:border-green-500 focus:outline-none focus:ring-green-500 dark:border-gray-600"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">Password</label>
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="mt-1 block w-full rounded-md border border-gray-300 bg-surface-primary px-3 py-2 text-text-primary focus:border-green-500 focus:outline-none focus:ring-green-500 dark:border-gray-600"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">Role</label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    className="mt-1 block w-full rounded-md border border-gray-300 bg-surface-primary px-3 py-2 text-text-primary focus:border-green-500 focus:outline-none focus:ring-green-500 dark:border-gray-600"
                                >
                                    <option value="USER">User</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                            </div>
                        </div>
                    }
                    buttons={
                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={() => setIsCreateOpen(false)}
                                className="rounded-md bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateUser}
                                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                            >
                                Create
                            </button>
                        </div>
                    }
                />
            </OGDialog>

            {/* Edit User Modal */}
            <OGDialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogTemplate
                    title="Edit User"
                    className="w-full max-w-lg"
                    showCloseButton={true}
                    showCancelButton={false}
                    main={
                        <div className="space-y-4 p-4">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="mt-1 block w-full rounded-md border border-gray-300 bg-surface-primary px-3 py-2 text-text-primary focus:border-green-500 focus:outline-none focus:ring-green-500 dark:border-gray-600"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">Username</label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    className="mt-1 block w-full rounded-md border border-gray-300 bg-surface-primary px-3 py-2 text-text-primary focus:border-green-500 focus:outline-none focus:ring-green-500 dark:border-gray-600"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="mt-1 block w-full rounded-md border border-gray-300 bg-surface-primary px-3 py-2 text-text-primary focus:border-green-500 focus:outline-none focus:ring-green-500 dark:border-gray-600"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">Role</label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    className="mt-1 block w-full rounded-md border border-gray-300 bg-surface-primary px-3 py-2 text-text-primary focus:border-green-500 focus:outline-none focus:ring-green-500 dark:border-gray-600"
                                >
                                    <option value="USER">User</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                            </div>
                        </div>
                    }
                    buttons={
                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={() => setIsEditOpen(false)}
                                className="rounded-md bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdateUser}
                                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                            >
                                Save Changes
                            </button>
                        </div>
                    }
                />
            </OGDialog>

            {/* Delete Confirmation Modal */}
            <OGDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogTemplate
                    title="Confirm Delete"
                    className="w-full max-w-md"
                    showCloseButton={true}
                    showCancelButton={false}
                    main={
                        <div className="p-4">
                            <p className="text-text-primary">
                                Are you sure you want to delete this user? This action cannot be undone.
                            </p>
                        </div>
                    }
                    buttons={
                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={() => {
                                    setIsDeleteOpen(false);
                                    setUserToDelete(null);
                                }}
                                className="rounded-md bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteUser}
                                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                            >
                                Delete
                            </button>
                        </div>
                    }
                />
            </OGDialog>
        </div>
    );
}
