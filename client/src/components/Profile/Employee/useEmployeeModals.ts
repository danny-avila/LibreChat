import { useState } from 'react';

export function useEmployeeModals() {
  const [activeModal, setActiveModal] = useState<'none' | 'task' | 'chat' | 'deleteTask' | 'resolveTicket'>('none');
  const [activeData, setActiveData] = useState<any>(null);
  const [taskMode, setTaskMode] = useState<'create' | 'edit'>('create');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  return {
    activeModal,
    setActiveModal,
    activeData,
    setActiveData,
    taskMode,
    setTaskMode,
    selectedTicketId,
    setSelectedTicketId,
  };
}
