import React, { useState, useEffect, useMemo } from 'react';
import ProfileStats from './ProfileStats';
import { useOperationalData } from '../../hooks/useOperationalData';
import { useTickets } from '../../hooks/useTickets';
import CustomerProjectsTab from './Customer/CustomerProjectsTab';
import CustomerTicketsTab from './Customer/CustomerTicketsTab';
import { useCustomerModals } from './Customer/useCustomerModals';
import TicketNewModal from './Modals/TicketNewModal';
import TicketChatModal from './Modals/TicketChatModal';
import TicketEditModal from './Modals/TicketEditModal';
import ProjectModal from './Modals/ProjectModal';
import DeleteConfirmModal from './Modals/DeleteConfirmModal';
import ResolveConfirmModal from './Modals/ResolveConfirmModal';

export default function CustomerDashboard({ profile }: { profile: any }) {
  const [tab, setTab] = useState<'projects' | 'tickets'>('projects');
  const [projectSearch, setProjectSearch] = useState('');
  const [ticketSearch, setTicketSearch] = useState('');
  // For delete project modal
  const [projectToDelete, setProjectToDelete] = useState<any>(null);
  // Track hidden (deleted) projects client-side, persist in localStorage
  const HIDDEN_KEY = `hiddenProjectIds_${profile.userId}`;
  const [hiddenProjectIds, setHiddenProjectIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(HIDDEN_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Sync to localStorage when hiddenProjectIds changes
  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(hiddenProjectIds));
    } catch {}
  }, [hiddenProjectIds]);

  const {
    activeModal,
    setActiveModal,
    selectedTicketId,
    setSelectedTicketId,
    dataToEdit,
    setDataToEdit,
  } = useCustomerModals();

  const {
    projects,
    fetchProjects,
    crudProject,
    isSubmitting: projectSubmitting,
  } = useOperationalData(profile.userId, 'customer');

  const {
    tickets,
    fetchTickets,
    createTicket,
    replyTicket,
    updateTicket,
    deleteTicket,
    isSubmitting: ticketSubmitting,
  } = useTickets(profile.userId, 'customer', profile.username);

  useEffect(() => {
    if (tab === 'projects') fetchProjects();
    if (tab === 'tickets') fetchTickets();
  }, [tab]);

  const activeChatTicket = useMemo(() => {
    if (!selectedTicketId) return null;
    return tickets.find((t) => t.ticketId === selectedTicketId) || null;
  }, [tickets, selectedTicketId]);

  // Project
  // Ensure all required fields are present for project creation
  const handleCreateProject = async (data: any) => {
    const projectData = {
      name: data.name,
      description: data.description,
      budget: Number(data.budget) || 0,
      startDate: data.startDate,
      deadline: data.deadline,
      status: data.status || 'active',
      progress: 0, // Always 0 on create
    };
    if (await crudProject('create', projectData)) setActiveModal('none');
  };
  const handleUpdateProject = async (data: any) => {
    const projectData = {
      ...data,
      budget: Number(data.budget) || 0,
    };
    if (await crudProject('update', projectData)) setActiveModal('none');
  };

  // Delete project handler (modal) - just hide from UI
  const handleDeleteProject = () => {
    if (projectToDelete) {
      const id = projectToDelete.projectId || projectToDelete._id;
      setHiddenProjectIds((prev) => [...prev, id]);
      setProjectToDelete(null);
      setActiveModal('none');
    }
  };

  // Ticket
  const handleUpdateTicket = async (data: any) => {
    const success = await updateTicket(data.ticketId, {
      subject: data.subject,
      description: data.description,
      priority: data.priority,
    });
    if (success) setActiveModal('none');
  };

  const handleConfirmDeleteTicket = async () => {
    if (selectedTicketId) {
      await deleteTicket(selectedTicketId);
      setActiveModal('none');
      setSelectedTicketId(null);
    }
  };

  const handleConfirmResolveTicket = async () => {
    if (dataToEdit) {
      await updateTicket(dataToEdit.ticketId, { status: 'closed' });
      setActiveModal('none');
      setDataToEdit(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col items-center justify-between gap-4 border-b pb-4 md:flex-row">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Client Portal</h1>
          <p className="text-text-secondary">Welcome back, {profile.username || 'Customer'}</p>
        </div>
        <div className="flex gap-2 rounded-lg border border-border-light bg-surface-primary-alt p-1">
          <button
            onClick={() => setTab('projects')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${tab === 'projects' ? 'bg-white text-blue-600 shadow' : 'text-text-secondary hover:bg-gray-100'}`}
          >
            My Projects
          </button>
          <button
            onClick={() => setTab('tickets')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${tab === 'tickets' ? 'bg-white text-blue-600 shadow' : 'text-text-secondary hover:bg-gray-100'}`}
          >
            Support
          </button>
        </div>
      </div>

      <ProfileStats
        stats={[
          { title: 'Active Projects', value: projects.length.toString(), icon: <span>🚀</span> },
          {
            title: 'Open Tickets',
            value: tickets.filter((t) => t.status !== 'closed').length.toString(),
            icon: <span>🎫</span>,
          },
        ]}
      />

      {tab === 'projects' && (
        <CustomerProjectsTab
          projects={projects.filter(
            (p: any) => !hiddenProjectIds.includes(p.projectId || p._id)
          )}
          projectSearch={projectSearch}
          setProjectSearch={setProjectSearch}
          onEditProject={(p: any) => {
            setDataToEdit(p);
            setActiveModal('editProject');
          }}
          onDeleteProject={(p: any) => {
            setProjectToDelete(p);
            setActiveModal('deleteProject');
          }}
          onNewProject={() => setActiveModal('newProject')}
        />
      )}
      {/* Delete Project Modal */}
      {activeModal === 'deleteProject' && projectToDelete && (
        <DeleteConfirmModal
          title="Delete Project"
          message={`Are you sure you want to delete project "${projectToDelete.name}"? This cannot be undone.`}
          isDeleting={projectSubmitting}
          onConfirm={handleDeleteProject}
          onClose={() => {
            setProjectToDelete(null);
            setActiveModal('none');
          }}
        />
      )}

      {tab === 'tickets' && (
        <CustomerTicketsTab
          tickets={tickets}
          ticketSearch={ticketSearch}
          setTicketSearch={setTicketSearch}
          onNewTicket={() => setActiveModal('newTicket')}
          onChat={(t: any) => {
            setSelectedTicketId(t.ticketId);
            setActiveModal('chat');
          }}
          onEdit={(t: any) => {
            setDataToEdit(t);
            setActiveModal('editTicket');
          }}
          onDelete={(t: any) => {
            setSelectedTicketId(t.ticketId);
            setActiveModal('deleteTicket');
          }}
          onResolve={(t: any) => {
            setDataToEdit(t);
            setActiveModal('resolveTicket');
          }}
        />
      )}

      {/* === MODALS === */}
      {activeModal === 'newTicket' && (
        <TicketNewModal
          onCreate={async (d) => {
            const ok = await createTicket(d);
            if (ok) setActiveModal('none');
          }}
          onClose={() => setActiveModal('none')}
          isSubmitting={ticketSubmitting}
        />
      )}

      {activeModal === 'editTicket' && dataToEdit && (
        <TicketEditModal
          ticket={dataToEdit}
          onUpdate={handleUpdateTicket}
          onClose={() => setActiveModal('none')}
          isSubmitting={ticketSubmitting}
        />
      )}

      {activeModal === 'chat' && activeChatTicket && (
        <TicketChatModal
          ticket={activeChatTicket}
          currentUserRole="customer"
          onReply={replyTicket}
          onClose={() => {
            setActiveModal('none');
            setSelectedTicketId(null);
          }}
        />
      )}

      {activeModal === 'deleteTicket' && (
        <DeleteConfirmModal
          title="Delete Ticket"
          message="Are you sure? This cannot be undone."
          isDeleting={ticketSubmitting}
          onConfirm={handleConfirmDeleteTicket}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'resolveTicket' && (
        <ResolveConfirmModal
          title="Close Ticket"
          message="Are you sure you want to close this ticket?"
          isProcessing={ticketSubmitting}
          onConfirm={handleConfirmResolveTicket}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'newProject' && (
        <ProjectModal
          mode="create"
          onSubmit={handleCreateProject}
          onClose={() => setActiveModal('none')}
          isSubmitting={projectSubmitting}
        />
      )}

      {activeModal === 'editProject' && dataToEdit && (
        <ProjectModal
          mode="edit"
          project={dataToEdit}
          onSubmit={handleUpdateProject}
          onClose={() => setActiveModal('none')}
          isSubmitting={projectSubmitting}
        />
      )}
    </div>
  );
}
