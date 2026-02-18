import React, { useState, useEffect, useMemo } from 'react';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks/AuthContext';
import ProfileStats from './ProfileStats';
import TaskModal from './Modals/TaskModal';
import TicketChatModal from './Modals/TicketChatModal';
import DeleteConfirmModal from './Modals/DeleteConfirmModal';
import ResolveConfirmModal from './Modals/ResolveConfirmModal';
import { useOperationalData } from '../../hooks/useOperationalData';
import { useTickets } from '../../hooks/useTickets';
import { Project, Ticket } from './types';
import EmployeeProjectsTab from './Employee/EmployeeProjectsTab';
import EmployeeTasksTab from './Employee/EmployeeTasksTab';
import EmployeeSupportTab from './Employee/EmployeeSupportTab';
import { useEmployeeModals } from './Employee/useEmployeeModals';

interface SignageOrder {
  orderId: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  type: 'print' | 'buy' | string;
  copies?: number;
  totalAmount?: number;
  status: string;
  createdAt?: string;
  dueDate?: string;
}

export default function EmployeeDashboard({ profile }: { profile: any }) {
  const { showToast } = useToastContext();
  const { token } = useAuthContext();
  const [tab, setTab] = useState<'projects' | 'tasks' | 'support' | 'orders' | 'docgen'>('projects');
  const [projectSearch, setProjectSearch] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [ticketSearch, setTicketSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Signage orders state
  const [myOrders, setMyOrders] = useState<SignageOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  const {
    activeModal,
    setActiveModal,
    activeData,
    setActiveData,
    taskMode,
    setTaskMode,
    selectedTicketId,
    setSelectedTicketId,
  } = useEmployeeModals();

  const {
    projects,
    tasks,
    employees,
    fetchProjects,
    fetchTasks,
    fetchEmployees,
    crudTask,
    isSubmitting: taskSubmitting,
  } = useOperationalData(profile.userId, 'employee');

  // Calculate project progress based on completed tasks
  const projectsWithProgress = useMemo(() => {
    return projects.map((project) => {
      const projectTasks = tasks.filter((t) => t.projectId === project.projectId || t.projectId === project._id);
      const totalTasks = projectTasks.length;
      const completedTasks = projectTasks.filter((t) => t.status === 'completed').length;
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      return { ...project, progress };
    });
  }, [projects, tasks]);

  const {
    tickets,
    fetchTickets,
    updateTicket,
    replyTicket,
    isSubmitting: ticketSubmitting,
  } = useTickets(profile.userId, 'employee', profile.username);

  useEffect(() => {
    fetchEmployees();
    if (tab === 'projects') fetchProjects();
    if (tab === 'tasks') fetchTasks(null);
    if (tab === 'support') fetchTickets();
    if (tab === 'orders') fetchMyOrders();
  }, [tab]);

  useEffect(() => {
    const pid = selectedProject?.projectId || selectedProject?._id;
    if (pid) fetchTasks(pid);
  }, [selectedProject]);

  const activeChatTicket = useMemo(() => {
    if (!selectedTicketId) return null;
    return tickets.find((t) => t.ticketId === selectedTicketId) || null;
  }, [tickets, selectedTicketId]);

  const { teamInbox, myWorkspace } = useMemo(() => {
    const inbox = tickets.filter((t) => t.assignedTo !== profile.userId && t.status !== 'closed');
    const mine = tickets.filter((t) => t.assignedTo === profile.userId && t.status !== 'closed');
    if (ticketSearch.trim()) {
      const lower = ticketSearch.toLowerCase();
      return {
        teamInbox: inbox.filter((t) => t.subject.toLowerCase().includes(lower)),
        myWorkspace: mine.filter((t) => t.subject.toLowerCase().includes(lower)),
      };
    }
    return { teamInbox: inbox, myWorkspace: mine };
  }, [tickets, profile.userId, ticketSearch]);

  // --- HANDLERS ---
  const fetchMyOrders = async () => {
    if (!token) {
      setOrdersError('Please log in to view orders.');
      setOrdersLoading(false);
      return;
    }
    try {
      setOrdersLoading(true);
      setOrdersError(null);

      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch('/api/signage/my-orders', {
        credentials: 'include',
        headers,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Failed to load orders (${response.status})`);
      }

      const data = await response.json();
      const list: SignageOrder[] = Array.isArray(data)
        ? data
        : data.orders || data.data || [];
      setMyOrders(list);
    } catch (error: any) {
      console.error('Failed to fetch my orders:', error);
      setOrdersError(error.message || 'Failed to load orders');
      setMyOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      setUpdatingOrderId(orderId);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`/api/signage/my-orders/${orderId}/status`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to update order status');
      }

      await fetchMyOrders();
      showToast({
        message: `Order status updated to ${newStatus}`,
        status: 'success',
      });
    } catch (error: any) {
      console.error('Failed to update order status:', error);
      showToast({ message: error.message || 'Update failed', status: 'error' });
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleTaskSubmit = async (data: any) => {
    const pid = selectedProject?.projectId || selectedProject?._id || '';
    const success = await crudTask(taskMode, { ...data, projectId: pid });
    if (success) {
      setActiveModal('none');
      // If viewing a project detail, refetch tasks for that project
      if (selectedProject) fetchTasks(pid);
    }
  };

  const handleTaskDelete = async () => {
    if (activeData) {
      await crudTask('delete', { _id: activeData._id || activeData.id });
      setActiveModal('none');
    }
  };

  const handleClaimTicket = async (ticket: Ticket) => {
    if (confirm(`Claim ticket "${ticket.subject}"?`)) {
      await updateTicket(ticket.ticketId, { assignedTo: profile.userId, status: 'in-progress' });
    }
  };

  const handleConfirmResolve = async () => {
    if (activeData) {
      await updateTicket(activeData.ticketId, { status: 'closed' });
      setActiveModal('none');
      setActiveData(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col items-center justify-between gap-4 border-b pb-4 md:flex-row">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Employee Workspace</h1>
          <p className="text-text-secondary">Manage projects, tasks, and support tickets.</p>
        </div>
        <div className="w-full overflow-x-auto md:w-auto">
          <div className="flex gap-2 rounded-lg border border-border-light bg-surface-primary-alt p-1">
            {[
              { key: 'projects', label: 'Projects' },
              { key: 'tasks', label: 'Tasks' },
              { key: 'support', label: 'Support' },
              { key: 'orders', label: 'Print Queue' },
              { key: 'docgen', label: 'Document Generator' },
            ].map((tabObj) => (
              <button
                key={tabObj.key}
                onClick={() => {
                  setTab(tabObj.key as any);
                  setSelectedProject(null);
                }}
                className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium capitalize transition-all ${
                  tab === tabObj.key
                    ? 'bg-white text-blue-600 shadow'
                    : 'text-text-secondary hover:bg-gray-100'
                }`}
              >
                {tabObj.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ProfileStats
        stats={[
          {
            title: 'My Active Tasks',
            value: tasks
              .filter((t) => t.assignedTo === profile.userId && t.status !== 'completed')
              .length.toString(),
            icon: <span>✅</span>,
          },
          {
            title: 'Assigned Tickets',
            value: myWorkspace.length.toString(),
            icon: <span>🎫</span>,
          },
          {
            title: 'Print Orders',
            value: myOrders.length.toString(),
            icon: <span>🖨️</span>,
          },
          { title: 'Team Projects', value: projects.length.toString(), icon: <span>🚀</span> },
        ]}
      />

      {/* --- MAIN CONTENT SWITCHER --- */}

      {/* 1. PROJECTS TAB */}
      {tab === 'projects' && (
        <EmployeeProjectsTab
          projects={projectsWithProgress}
          selectedProject={selectedProject}
          setSelectedProject={setSelectedProject}
          projectSearch={projectSearch}
          setProjectSearch={setProjectSearch}
          tasks={tasks}
          taskSearch={taskSearch}
          setTaskSearch={setTaskSearch}
          employees={employees}
          onAddTask={() => {
            setTaskMode('create');
            setActiveModal('task');
            setActiveData(null);
          }}
          onEditTask={(t: any) => {
            setTaskMode('edit');
            setActiveData(t);
            setActiveModal('task');
          }}
          onDeleteTask={(t: any) => {
            setActiveData(t);
            setActiveModal('deleteTask');
          }}
        />
      )}

      {/* 2. TASKS TAB */}
      {tab === 'tasks' && (
        <EmployeeTasksTab
          tasks={tasks}
          taskSearch={taskSearch}
          setTaskSearch={setTaskSearch}
          onAddTask={() => {
            setTaskMode('create');
            setActiveModal('task');
            setActiveData(null);
          }}
          onEditTask={(t: any) => {
            setTaskMode('edit');
            setActiveData(t);
            setActiveModal('task');
          }}
          onDeleteTask={(t: any) => {
            setActiveData(t);
            setActiveModal('deleteTask');
          }}
        />
      )}

      {/* 3. SUPPORT TAB */}
      {tab === 'support' && (
        <EmployeeSupportTab
          teamInbox={teamInbox}
          myWorkspace={myWorkspace}
          ticketSearch={ticketSearch}
          setTicketSearch={setTicketSearch}
          onClaimTicket={handleClaimTicket}
          onChat={(t: any) => {
            setSelectedTicketId(t.ticketId);
            setActiveModal('chat');
          }}
          onResolve={(t: any) => {
            setActiveData(t);
            setActiveModal('resolveTicket');
          }}
          onRefresh={fetchTickets}
        />
      )}

      {/* 4. ORDERS TAB (PRINT QUEUE) */}
      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-xl font-bold text-gray-900">My Print Queue</h2>
            <button
              onClick={fetchMyOrders}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Refresh Orders
            </button>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            {ordersLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              </div>
            ) : ordersError ? (
              <div className="flex h-64 flex-col items-center justify-center text-red-500">
                <p className="mb-2 text-sm font-medium">Failed to load orders</p>
                <p className="text-xs">{ordersError}</p>
              </div>
            ) : myOrders.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-gray-500">
                <span className="mb-2 text-4xl">🖨️</span>
                <p>No orders assigned to you</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Order #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Copies
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Due Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Update Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {myOrders.map((order, idx) => {
                      const isBusy = updatingOrderId === order.orderId;
                      const customerLabel =
                        order.customerName || order.customerEmail || order.customerId;
                      
                      return (
                        <tr key={order.orderId || idx}>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                            {order.orderId}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                            {customerLabel}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                            <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
                              {order.type}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                            {order.copies ?? '-'}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                            {order.totalAmount != null ? `$${order.totalAmount}` : '-'}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                                order.status === 'delivered'
                                  ? 'bg-green-100 text-green-800'
                                  : order.status === 'printing'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : order.status === 'printed'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {order.status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                            {order.dueDate
                              ? new Date(order.dueDate).toLocaleDateString()
                              : '-'}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm">
                            <select
                              value={order.status}
                              onChange={(e) =>
                                handleUpdateOrderStatus(order.orderId, e.target.value)
                              }
                              disabled={isBusy}
                              className="rounded-lg border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
                            >
                              <option value="received">Received</option>
                              <option value="printing">Printing</option>
                              <option value="printed">Printed</option>
                              <option value="delivered">Delivered</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. DOCUMENT GENERATOR (IFRAME) TAB */}
      {tab === 'docgen' && (
        <div
          className="h-full w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
          style={{ minHeight: '800px' }}
        >
          <iframe
            src="https://client.dev.scaffad.cloud.jamot.pro/"
            title="Document Generator"
            width="100%"
            height="100%"
            style={{ border: 'none', minHeight: '800px' }}
            allow="clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        </div>
      )}

      {/* === MODALS === */}
      {activeModal === 'task' && (
        <TaskModal
          open={true}
          mode={taskMode}
          task={activeData}
          employees={employees}
          isSubmitting={taskSubmitting}
          onSubmit={handleTaskSubmit}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'deleteTask' && (
        <DeleteConfirmModal
          title="Delete Task"
          message="Are you sure?"
          isDeleting={taskSubmitting}
          onConfirm={handleTaskDelete}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'resolveTicket' && (
        <ResolveConfirmModal
          title="Resolve Ticket"
          message="Mark as Resolved? This will close the ticket."
          isProcessing={ticketSubmitting}
          onConfirm={handleConfirmResolve}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'chat' && activeChatTicket && (
        <TicketChatModal
          ticket={activeChatTicket}
          currentUserRole="employee"
          onReply={replyTicket}
          onResolve={(id) => {
            setActiveData({ ticketId: id });
            setActiveModal('resolveTicket');
          }}
          onClose={() => {
            setActiveModal('none');
            setSelectedTicketId(null);
          }}
        />
      )}
    </div>
  );
}
