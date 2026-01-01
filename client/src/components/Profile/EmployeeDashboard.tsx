import React, { useState, useEffect, useMemo } from 'react';
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

export default function EmployeeDashboard({ profile }: { profile: any }) {
  const [tab, setTab] = useState<'projects' | 'tasks' | 'support' | 'docgen'>('projects');
  const [projectSearch, setProjectSearch] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [ticketSearch, setTicketSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

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
        <div className="flex gap-2 rounded-lg border border-border-light bg-surface-primary-alt p-1">
          {[
            { key: 'projects', label: 'Projects' },
            { key: 'tasks', label: 'Tasks' },
            { key: 'support', label: 'Support' },
            { key: 'docgen', label: 'Document Generator' },
          ].map((tabObj) => (
            <button
              key={tabObj.key}
              onClick={() => {
                setTab(tabObj.key as any);
                setSelectedProject(null);
              }}
              className={`rounded-md px-4 py-2 text-sm font-medium capitalize transition-all ${
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

      {/* 4. DOCUMENT GENERATOR (IFRAME) TAB */}
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
