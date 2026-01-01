// Shared Interfaces
export interface User {
  userId: string;
  username: string;
  email: string;
  role: string;
}

export interface Workflow {
  workflowId: string;
  workflowName: string;
  description?: string;
  endpoint?: string;
  // Untuk UI rendering
  icon?: React.ReactNode;
}

export interface Project {
  projectId: string; // Konsisten dengan backend n8n
  name: string;
  description: string;
  status: 'planning' | 'active' | 'completed' | 'on-hold';
  progress: number;
  startDate: string;
  deadline: string;
  budget: number;
  spent: number;
  managerId?: string;
}

export interface Task {
  _id?: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  dueDate: string;
  assignedTo?: string;
  assignedName?: string;
  projectId?: string;
}

export interface Message {
  senderId: string;
  senderName: string;
  role: 'employee' | 'customer';
  message: string;
  createdAt: string;
}

export interface Ticket {
  ticketId: string;
  subject: string;
  description: string;
  status: 'open' | 'in-progress' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  userId: string;
  assignedTo?: string;
  messages?: Message[];
  createdAt: string;
}
