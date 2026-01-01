import React from 'react';

interface WorkflowListProps {
  workflows: any[];
  onExecute: (workflowId: string) => void;
  executingWorkflow: string | null;
}

import WorkflowCard from './WorkflowCard';

const WorkflowList: React.FC<WorkflowListProps> = ({ workflows, onExecute, executingWorkflow }) => {
  if (!workflows || workflows.length === 0) {
    return null;
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {workflows.map((workflow: any) => (
        <WorkflowCard
          key={workflow.workflowId}
          {...workflow}
          onExecute={onExecute}
          isExecuting={executingWorkflow === workflow.workflowId}
        />
      ))}
    </div>
  );
};

export default WorkflowList;
