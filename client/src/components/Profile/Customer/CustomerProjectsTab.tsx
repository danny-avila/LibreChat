import React from 'react';
import ProjectList from '../ProjectList';

export default function CustomerProjectsTab({
  projects,
  projectSearch,
  setProjectSearch,
  onEditProject,
  onDeleteProject,
  onNewProject,
}) {
  return (
    <div className="duration-500 animate-in fade-in slide-in-from-bottom-4">
      <div className="mb-4 flex flex-col items-center justify-between gap-3 md:flex-row">
        <h2 className="text-xl font-semibold">Your Projects</h2>
        <div className="flex w-full gap-2 md:w-auto">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              placeholder="Search projects..."
              className="w-full rounded-lg border py-2 pl-9 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={projectSearch}
              onChange={e => setProjectSearch(e.target.value)}
            />
            <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
          </div>
          <button
            onClick={onNewProject}
            className="btn btn-primary flex items-center gap-1 whitespace-nowrap"
          >
            <span>+</span> New Project
          </button>
        </div>
      </div>
      <ProjectList
        projects={projects}
        searchTerm={projectSearch}
        onEdit={onEditProject}
        onDelete={onDeleteProject}
      />
    </div>
  );
}
