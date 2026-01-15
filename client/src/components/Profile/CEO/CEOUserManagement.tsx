import React, { useState, useEffect } from 'react';
import { useToastContext } from '@librechat/client';
import { Users, UserPlus, Trash2, Edit2, Shield, Briefcase, Eye, EyeOff } from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string;
  profileType: 'ceo' | 'employee' | 'customer';
  permissions: string[];
  department?: string;
  createdAt: string;
}

interface CreateUserData {
  email: string;
  name: string;
  password: string;
  profileType: 'employee' | 'ceo';
  department?: string;
}

export default function CEOUserManagement() {
  console.log('🎯 [UserManagement] Component mounted');
  const { showToast } = useToastContext();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'ceo' | 'employee' | 'customer'>('all');
  const [showPassword, setShowPassword] = useState(false);
  
  console.log('📊 [UserManagement] Current state - users:', users.length, 'loading:', loading, 'filter:', filterType);

  // Form state
  const [formData, setFormData] = useState<CreateUserData>({
    email: '',
    name: '',
    password: '',
    profileType: 'employee',
    department: '',
  });

  // Fetch users
  const fetchUsers = async () => {
    console.log('👥 [UserManagement] Fetching users...');
    console.log('🔍 [UserManagement] Filter type:', filterType);
    setLoading(true);
    try {
      const query = filterType !== 'all' ? `?profileType=${filterType}` : '';
      const url = `/api/admin/users${query}`;
      console.log('📍 [UserManagement] Request URL:', url);
      
      const response = await fetch(url, {
        credentials: 'include',
      });

      console.log('📡 [UserManagement] Response status:', response.status);
      console.log('📡 [UserManagement] Response ok:', response.ok);
      
      const contentType = response.headers.get('content-type');
      console.log('📄 [UserManagement] Content-Type:', contentType);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [UserManagement] Error response:', errorText);
        throw new Error('Failed to fetch users');
      }

      // Read response as text first to debug
      const responseText = await response.text();
      console.log('📄 [UserManagement] Raw response text:', responseText);
      console.log('📄 [UserManagement] Response length:', responseText.length);
      console.log('📄 [UserManagement] First 200 chars:', responseText.substring(0, 200));

      try {
        const data = JSON.parse(responseText);
        console.log('📥 [UserManagement] Users data received:', data);
        console.log('📊 [UserManagement] Users count:', data.users?.length || 0);
        setUsers(data.users || []);
      } catch (parseError) {
        console.error('❌ [UserManagement] JSON parse error:', parseError);
        console.error('❌ [UserManagement] Failed to parse response as JSON');
        throw new Error('Server returned invalid JSON response');
      }
    } catch (error: any) {
      console.error('❌ [UserManagement] Fetch error:', error);
      showToast({ message: error.message, status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('🔄 [UserManagement] useEffect triggered, calling fetchUsers()');
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType]);

  // Create new user
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('➕ [UserManagement] Creating new user...');
    console.log('📝 [UserManagement] Form data:', formData);

    if (!formData.email || !formData.name || !formData.password) {
      console.warn('⚠️ [UserManagement] Missing required fields');
      showToast({ message: 'Please fill all required fields', status: 'error' });
      return;
    }

    try {
      console.log('📤 [UserManagement] Sending create request...');
      const response = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      console.log('📡 [UserManagement] Create response status:', response.status);

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ [UserManagement] Create error:', error);
        throw new Error(error.message || 'Failed to create user');
      }

      const result = await response.json();
      console.log('✅ [UserManagement] User created:', result);
      
      showToast({ message: 'User created successfully', status: 'success' });
      setShowCreateModal(false);
      setShowPassword(false);
      setFormData({
        email: '',
        name: '',
        password: '',
        profileType: 'employee',
        department: '',
      });
      fetchUsers();
    } catch (error: any) {
      console.error('❌ [UserManagement] Create failed:', error);
      showToast({ message: error.message, status: 'error' });
    }
  };

  // Delete user
  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to deactivate ${userName}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete user');
      }

      showToast({ message: 'User deactivated successfully', status: 'success' });
      fetchUsers();
    } catch (error: any) {
      showToast({ message: error.message, status: 'error' });
    }
  };

  // Get profile badge color
  const getProfileBadge = (profileType: string) => {
    const badges = {
      ceo: { color: 'bg-purple-100 text-purple-800', icon: Shield, label: 'CEO' },
      employee: { color: 'bg-blue-100 text-blue-800', icon: Briefcase, label: 'Employee' },
      customer: { color: 'bg-green-100 text-green-800', icon: Users, label: 'Customer' },
    };
    return badges[profileType as keyof typeof badges] || badges.customer;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-gray-700" />
          <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <UserPlus className="h-4 w-4" />
          Create User
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['all', 'ceo', 'employee', 'customer'].map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type as any)}
            className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors ${
              filterType === type
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Users Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          </div>
        ) : users.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-gray-500">
            <Users className="mb-2 h-12 w-12" />
            <p>No users found</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Profile Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Permissions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {users.map((user) => {
                const badge = getProfileBadge(user.profileType);
                const Icon = badge.icon;
                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-700">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{user.name}</div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.color}`}
                      >
                        <Icon className="h-3 w-3" />
                        {badge.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {user.department || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="max-w-xs truncate" title={user.permissions.join(', ')}>
                        {user.permissions.length} permissions
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                      <button
                        onClick={() => handleDeleteUser(user.id, user.name)}
                        className="text-red-600 transition-colors hover:text-red-900"
                        title="Deactivate user"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-xl font-bold text-gray-900">Create New User</h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-blue-500 focus:outline-none"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Profile Type *
                </label>
                <select
                  value={formData.profileType}
                  onChange={(e) =>
                    setFormData({ ...formData, profileType: e.target.value as 'employee' | 'ceo' })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="employee">Employee</option>
                  <option value="ceo">CEO</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Department (Optional)
                </label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="e.g., Engineering, Sales"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setShowPassword(false);
                  }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
