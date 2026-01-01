import { useState } from 'react';

export function useCustomerModals() {
  const [activeModal, setActiveModal] = useState<
    | 'none'
    | 'newTicket'
    | 'chat'
    | 'editTicket'
    | 'deleteTicket'
    | 'resolveTicket'
    | 'newProject'
    | 'editProject'
    | 'deleteProject'
  >('none');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [dataToEdit, setDataToEdit] = useState<any>(null);

  return {
    activeModal,
    setActiveModal,
    selectedTicketId,
    setSelectedTicketId,
    dataToEdit,
    setDataToEdit,
  };
}
