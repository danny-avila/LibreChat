import { useState, useCallback } from 'react';
import { Project, Task, User } from '../components/Profile/types';
import { useToastContext } from '@librechat/client';

const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || 'https://nadyaputriast-n8n.hf.space';

export const useOperationalData = (userId: string, profileType: string) => {
  const { showToast } = useToastContext();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Fetch projects with normalized ID
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${N8N_URL}/webhook/librechat/project-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileType, action: 'list', userId }),
      });
      const result = await res.json();

      // Normalize project data structure
      let rawData: any[] = [];
      if (result?.data?.projects && Array.isArray(result.data.projects)) {
        rawData = result.data.projects;
      } else if (result?.data && Array.isArray(result.data)) {
        rawData = result.data;
      } else if (Array.isArray(result)) {
        rawData = result;
      }

      // Ensure projectId is always present
      const cleanProjects: Project[] = rawData.map((p: any) => ({
        ...p,
        projectId: p.projectId ?? p._id ?? p.id,
      }));

      setProjects(cleanProjects);
    } catch (e: any) {
      console.error('Fetch projects error:', e);
      showToast({ message: 'Failed to fetch projects', status: 'error' });
    } finally {
      setLoading(false);
    }
  }, [userId, profileType, showToast]);

  // Fetch tasks, optionally by project
  const fetchTasks = useCallback(async (projectId?: string) => {
    try {
      const body: Record<string, any> = { action: 'list', profileType, userId };
      if (projectId) {
        body.projectId = projectId;
      }

      const res = await fetch(`${N8N_URL}/webhook/librechat/task-management`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const result = await res.json();

      // Normalize tasks data structure
      let tasksData: Task[] = [];
      const rawTasks = result?.data?.tasks || result?.tasks || result?.data || result;
      
      if (Array.isArray(rawTasks)) {
        tasksData = rawTasks;
      }

      setTasks(tasksData);
    } catch (e: any) {
      console.error('Fetch tasks error:', e);
      showToast({ message: `Failed to fetch tasks: ${e.message || e}`, status: 'error' });
      setTasks([]);
    }
  }, [userId, profileType, showToast]);

  // Fetch employees (role: employee)
  const fetchEmployees = useCallback(async () => {
    try {
      const response = await fetch(`${N8N_URL}/webhook/librechat/users-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'employee' }),
      });
      const res = await response.json();
      if (res?.success && Array.isArray(res.data)) {
        setEmployees(res.data);
      }
    } catch (e: any) {
      console.error('Fetch employees error:', e);
      showToast({ message: 'Failed to fetch employees', status: 'error' });
    }
  }, [showToast]);

  // CRUD for projects
  const crudProject = async (
    action: 'create' | 'update' | 'delete',
    data: Partial<Project>
  ): Promise<boolean> => {
    setIsSubmitting(true);
    const endpoints: Record<string, string> = {
      create: 'project-create',
      update: 'project-update',
      delete: 'project-delete',
    };

    try {
      await fetch(`${N8N_URL}/webhook/librechat/${endpoints[action]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          managerId: userId,
          profileType,
          projectId: data.projectId ?? data._id ?? data.id,
        }),
      });
      showToast({ message: `Project ${action}d successfully`, status: 'success' });
      await fetchProjects();
      return true;
    } catch (e: any) {
      console.error(`Project ${action} error:`, e);
      showToast({ message: `Project ${action} failed`, status: 'error' });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // CRUD for tasks
  const crudTask = async (
    action: 'create' | 'update' | 'delete',
    data: Partial<Task>
  ): Promise<boolean> => {
    setIsSubmitting(true);
    const endpoints: Record<string, string> = {
      create: 'task-create',
      update: 'task-update',
      delete: 'task-delete',
    };

    try {
      const payload = {
        ...data,
        assignedTo: data.assignedTo ?? userId,
        taskId: data.taskId ?? data._id ?? data.id,
      };

      await fetch(`${N8N_URL}/webhook/librechat/${endpoints[action]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showToast({ message: `Task ${action}d successfully`, status: 'success' });
      await fetchTasks(data.projectId);
      return true;
    } catch (e: any) {
      console.error(`Task ${action} error:`, e);
      showToast({ message: `Task ${action} failed`, status: 'error' });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    projects,
    tasks,
    employees,
    loading,
    isSubmitting,
    fetchProjects,
    fetchTasks,
    fetchEmployees,
    crudProject,
    crudTask,
  };
};
