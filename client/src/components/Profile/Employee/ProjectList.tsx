import React from 'react';
import { Project } from '../EmployeeDashboard';

interface ProjectListProps {
  projects: Project[];
  onSelect: (project: Project) => void;
}

const ProjectList: React.FC<ProjectListProps> = ({ projects, onSelect }) => {
  if (!projects.length) return <div className="text-center text-gray-400">No projects found.</div>;
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((proj, idx) => (
        <div
          key={proj.projectId || idx}
          className="cursor-pointer rounded-xl border border-border-light bg-surface-primary p-5 shadow-sm transition-all hover:shadow-md"
          onClick={() => onSelect(proj)}
        >
          <div className="mb-2 flex items-start justify-between">
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${proj.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
            >
              {proj.status}
            </span>
          </div>
          <h3 className="pr-8 text-lg font-bold text-text-primary">{proj.name}</h3>
          <div className="mb-1 mt-4 h-1.5 w-full rounded-full bg-gray-100">
            <div
              className="h-1.5 rounded-full bg-blue-600"
              style={{ width: `${proj.progress}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-text-tertiary">
            <span>{proj.progress}%</span>
            <span className="font-medium text-blue-600">Open →</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ProjectList;
