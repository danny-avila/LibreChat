import React, { useState, useMemo } from 'react';
import { Project } from '../types';

interface ProjectListProps {
  projects: Project[];
  onSelect?: (project: Project) => void;
  onEdit?: (project: Project) => void;
  onDelete?: (project: Project) => void;
  searchTerm?: string; // Props pencarian dari parent
}

type SortKey = 'name' | 'status' | 'progress' | 'deadline';

const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  onSelect,
  onEdit,
  onDelete,
  searchTerm = '',
}) => {
  // State Sorting
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Logic Filtering & Sorting (Memoized agar cepat)
  const processedProjects = useMemo(() => {
    let result = [...projects];

    // 1. FILTERING
    if (searchTerm.trim()) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(lowerTerm) ||
          (p.description || '').toLowerCase().includes(lowerTerm),
      );
    }

    // 2. SORTING
    result.sort((a, b) => {
      let valA: any = a[sortKey];
      let valB: any = b[sortKey];

      // Custom Logic: Status Priority (Active paling atas)
      if (sortKey === 'status') {
        const statusWeight: Record<string, number> = {
          active: 1,
          planning: 2,
          'on-hold': 3,
          completed: 4,
        };
        valA = statusWeight[valA?.toLowerCase()] || 99;
        valB = statusWeight[valB?.toLowerCase()] || 99;
      }
      // Custom Logic: Date (Deadline)
      else if (sortKey === 'deadline') {
        valA = new Date(valA || '2099-12-31').getTime();
        valB = new Date(valB || '2099-12-31').getTime();
      }
      // Custom Logic: String (Name)
      else if (sortKey === 'name') {
        valA = (valA || '').toLowerCase();
        valB = (valB || '').toLowerCase();
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [projects, searchTerm, sortKey, sortDir]);

  // Helper Toggle Sort
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="ml-1 text-gray-300">↕</span>;
    return sortDir === 'asc' ? (
      <span className="ml-1 text-blue-600">↑</span>
    ) : (
      <span className="ml-1 text-blue-600">↓</span>
    );
  };

  if (!projects.length)
    return <div className="py-10 text-center text-gray-400">No projects found.</div>;

  return (
    <div className="space-y-4">
      {/* HEADER SORTING BUTTONS */}
      <div className="mb-2 flex gap-2 overflow-x-auto pb-2 text-xs font-semibold text-gray-500">
        <button
          onClick={() => handleSort('status')}
          className={`flex items-center rounded border px-3 py-1.5 transition-colors ${sortKey === 'status' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'bg-white hover:bg-gray-50'}`}
        >
          Status {getSortIcon('status')}
        </button>
        <button
          onClick={() => handleSort('name')}
          className={`flex items-center rounded border px-3 py-1.5 transition-colors ${sortKey === 'name' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'bg-white hover:bg-gray-50'}`}
        >
          Name {getSortIcon('name')}
        </button>
        <button
          onClick={() => handleSort('progress')}
          className={`flex items-center rounded border px-3 py-1.5 transition-colors ${sortKey === 'progress' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'bg-white hover:bg-gray-50'}`}
        >
          Progress {getSortIcon('progress')}
        </button>
        <button
          onClick={() => handleSort('deadline')}
          className={`flex items-center rounded border px-3 py-1.5 transition-colors ${sortKey === 'deadline' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'bg-white hover:bg-gray-50'}`}
        >
          Deadline {getSortIcon('deadline')}
        </button>
      </div>

      {/* PROJECT GRID */}
      {processedProjects.length === 0 ? (
        <div className="rounded-lg border bg-gray-50 py-10 text-center text-gray-400">
          No projects match "{searchTerm}"
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {processedProjects.map((proj, idx) => (
            <div
              key={proj.projectId || idx}
              className="flex flex-col justify-between rounded-xl border border-border-light bg-surface-primary bg-white p-5 shadow-sm transition-all hover:shadow-md"
            >
              <div>
                <div className="mb-3 flex items-start justify-between">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                      proj.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : proj.status === 'completed'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {proj.status}
                  </span>
                  {(onEdit || onDelete) && (
                    <div className="flex gap-2">
                      {onEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(proj);
                          }}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          Edit
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(proj);
                          }}
                          className="text-xs font-medium text-red-600 hover:text-red-800"
                        >
                          Del
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <h3 className="mb-1 truncate text-lg font-bold text-text-primary" title={proj.name}>
                  {proj.name}
                </h3>
                <p className="mb-4 line-clamp-2 h-8 text-xs text-gray-500">{proj.description}</p>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Progress</span>
                    <span className="font-bold">{proj.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        proj.progress === 100 ? 'bg-green-500' : 'bg-blue-600'
                      }`}
                      style={{ width: `${proj.progress}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-gray-50 pt-3 text-xs text-gray-400">
                <span>Due: {proj.deadline || 'No deadline'}</span>
                {onSelect && (
                  <button
                    onClick={() => onSelect(proj)}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    View Tasks →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectList;
