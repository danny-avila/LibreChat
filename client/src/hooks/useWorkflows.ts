import { useState } from 'react';
import { useToastContext } from '@librechat/client';

export const useWorkflows = (profile: any) => {
  const { showToast } = useToastContext();
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [showResult, setShowResult] = useState(false);

  const executeWorkflow = async (workflowId: string, parameters: any = {}) => {
    setExecutingId(workflowId);
    setResult(null);
    try {
      const workflow = profile?.allowedWorkflows?.find((w: any) => w.workflowId === workflowId);
      const functionName = workflow?.workflowName;

      showToast({ message: `Executing ${functionName}...`, status: 'info' });

      // Memanggil endpoint backend LibreChat yang sudah kita buat sebelumnya
      const response = await fetch('/api/n8n-tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          functionName,
          parameters,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResult({ status: 'success', data: data.data, workflowName: functionName });
        showToast({ message: 'Execution successful', status: 'success' });
      } else {
        throw new Error(data.error || 'Execution failed');
      }
      setShowResult(true);
    } catch (error: any) {
      setResult({ status: 'error', error: error.message });
      setShowResult(true);
      showToast({ message: error.message, status: 'error' });
    } finally {
      setExecutingId(null);
    }
  };

  return { executeWorkflow, result, showResult, setShowResult, executingId };
};
