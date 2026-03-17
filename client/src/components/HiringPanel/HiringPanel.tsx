/* eslint-disable i18next/no-literal-string */
import React, { useState, useEffect } from 'react';
import { useHiringCandidates } from '~/hooks/useHiringCandidates';
import { useHiringTasks } from '~/hooks/useHiringTasks';
import TeamManagementView from './TeamManagementView';
import TaskBoard from './TaskBoard';

type HiringTab = 'team' | 'tasks';
const STORAGE_KEY = 'hiring:active-tab';

export default function HiringPanel() {
  const [activeTab, setActiveTab] = useState<HiringTab>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'tasks' ? 'tasks' : 'team';
    } catch {
      return 'team';
    }
  });

  const { candidates, loading: candidatesLoading, addCandidate } = useHiringCandidates();
  const { tasks, loading: tasksLoading, createTask, updateTask } = useHiringTasks();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, activeTab);
    } catch {
      // ignore
    }
  }, [activeTab]);

  return (
    <div className="h-full">
      {activeTab === 'team' ? (
        <TeamManagementView
          candidates={candidates}
          loading={candidatesLoading}
          onAddCandidate={addCandidate}
          onSwitchToTasks={() => setActiveTab('tasks')}
        />
      ) : (
        <TaskBoard
          tasks={tasks}
          loading={tasksLoading}
          onCreateTask={createTask}
          onUpdateTask={updateTask}
          onSwitchToTeam={() => setActiveTab('team')}
        />
      )}
    </div>
  );
}
