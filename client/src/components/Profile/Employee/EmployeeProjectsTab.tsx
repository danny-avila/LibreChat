import React from 'react';
import ProjectList from '../Employee/ProjectList';
import ProjectDetail from '../Employee/ProjectDetail';
import TaskList from '../Employee/TaskList';

export default function EmployeeProjectsTab({
  projects,
  selectedProject,
  setSelectedProject,
  projectSearch,
  setProjectSearch,
  tasks,
  taskSearch,
  setTaskSearch,
  employees,
  onAddTask,
  onEditTask,
  onDeleteTask,
}) {
  // Filter and sort projects by name
  const filteredProjects = projects
    .filter((p) =>
      p.name?.toLowerCase().includes(projectSearch.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  // Filter and sort tasks by title (or dueDate if available)
  const filteredTasks = tasks
    .filter((t) =>
      t.title?.toLowerCase().includes(taskSearch.toLowerCase())
    )
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate) - new Date(b.dueDate);
      }
      return a.title.localeCompare(b.title);
    });
  return !selectedProject ? (
    <>
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 className="text-2xl font-bold text-text-primary">All Projects</h2>
        <div className="relative w-full md:w-72">
          <input
            type="text"
            placeholder="Search projects..."
            className="w-full rounded-lg border py-2 pl-9 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            value={projectSearch}
            onChange={e => setProjectSearch(e.target.value)}
          />
          <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
        </div>
      </div>
      {filteredProjects.length === 0 ? (
        <div className="rounded-lg border bg-gray-50 py-10 text-center text-gray-400 text-lg">
          No projects found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <div
              key={project.projectId || project._id}
              className="flex flex-col justify-between rounded-xl border border-border-light bg-white p-5 shadow-sm transition-all hover:shadow-md cursor-pointer"
              onClick={() => setSelectedProject(project)}
            >
              <div>
                <div className="mb-3 flex items-start justify-between">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                    project.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : project.status === 'completed'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {project.status}
                  </span>
                  <button
                    className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600 shadow"
                    onClick={e => {
                      e.stopPropagation();
                      setSelectedProject(project);
                      onAddTask();
                    }}
                  >
                    + Add Task
                  </button>
                </div>
                <h4 className="mb-1 truncate text-lg font-bold text-text-primary" title={project.name}>
                  {project.name}
                </h4>
                <p className="mb-4 line-clamp-2 h-8 text-xs text-gray-500">{project.description}</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Progress</span>
                    <span className="font-bold">{project.progress || 0}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        project.progress === 100 ? 'bg-green-500' : 'bg-blue-600'
                      }`}
                      style={{ width: `${project.progress || 0}%` }}
                    ></div>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-gray-50 pt-3 text-xs text-gray-400">
                <span>Due: {project.deadline || 'No deadline'}</span>
                <span className="font-medium text-blue-600 hover:underline">View Tasks →</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  ) : (
    <>
      <ProjectDetail project={selectedProject} onBack={() => setSelectedProject(null)} />
      <div className="mt-8 rounded-xl border bg-surface-primary bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h3 className="text-xl font-bold text-gray-800">
            Tasks for {selectedProject.name}
          </h3>
          <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <input
                type="text"
                placeholder="Search tasks..."
                className="w-full rounded-lg border py-2 pl-9 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                value={taskSearch}
                onChange={e => setTaskSearch(e.target.value)}
              />
              <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
            </div>
            <button
              onClick={onAddTask}
              className="btn btn-primary flex items-center gap-1 text-sm"
            >
              <span>+</span> Add Task
            </button>
          </div>
        </div>
        <TaskList
          tasks={filteredTasks}
          onEdit={onEditTask}
          onDelete={onDeleteTask}
          employees={employees}
        />
      </div>
    </>
  );
}
