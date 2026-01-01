import React from 'react';
import { Project } from './types';

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, onBack }) => {
  return (
    <div className="space-y-6 duration-300 animate-in fade-in slide-in-from-left-4">
      <button
        onClick={onBack}
        className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
      >
        <span>←</span> Back to Projects
      </button>

      <div className="rounded-xl border border-border-light bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{project.name}</h2>
            <p className="mt-1 text-sm text-gray-500">ID: {project.projectId || project._id}</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
              project.status === 'active'
                ? 'bg-green-100 text-green-700'
                : project.status === 'completed'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {project.status}
          </span>
        </div>

        <p className="mb-8 leading-relaxed text-gray-600">
          {project.description || 'No description provided.'}
        </p>

        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Progress</span>
            <span className="text-lg font-semibold text-gray-800">{project.progress}%</span>
            <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200">
              <div
                className="h-1.5 rounded-full bg-blue-600"
                style={{ width: `${project.progress}%` }}
              ></div>
            </div>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Timeline</span>
            <div className="font-medium text-gray-800">
              {project.startDate ? new Date(project.startDate).toLocaleDateString() : 'N/A'}
              <span className="mx-1 text-gray-400">→</span>
              {project.deadline ? new Date(project.deadline).toLocaleDateString() : 'N/A'}
            </div>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Budget</span>
            <span className="text-lg font-semibold text-green-700">
              ${project.budget?.toLocaleString() || 0}
            </span>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Spent</span>
            <span className="text-lg font-semibold text-red-600">
              ${project.spent?.toLocaleString() || 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetail;
