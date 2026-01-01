import React from 'react';
import { Project } from '../EmployeeDashboard';

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, onBack }) => {
  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="mb-4 rounded bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
      >
        ← Back to Projects
      </button>
      <div className="rounded-xl border border-border-light bg-white p-6 shadow-md">
        <h2 className="text-2xl font-bold mb-2">{project.name}</h2>
        <div className="mb-2 text-gray-600">{project.description}</div>
        <div className="mb-2 text-xs text-gray-500">
          Status: {project.status} | Progress: {project.progress}%
        </div>
        <div className="mb-2 text-xs text-gray-500">
          Start: {project.startDate} | Deadline: {project.deadline}
        </div>
        <div className="mb-2 text-xs text-gray-500">
          Budget: ${project.budget} | Spent: ${project.spent}
        </div>
      </div>
    </div>
  );
};

export default ProjectDetail;
