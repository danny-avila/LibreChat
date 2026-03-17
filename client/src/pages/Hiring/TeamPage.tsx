import { useHiringCandidates } from '~/hooks/useHiringCandidates';
import TeamManagementView from '~/components/HiringPanel/TeamManagementView';
import { useNavigate } from 'react-router-dom';

export default function TeamPage() {
  const { candidates, loading, addCandidate } = useHiringCandidates();
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-y-auto">
      <TeamManagementView
        candidates={candidates}
        loading={loading}
        onAddCandidate={addCandidate}
        onSwitchToTasks={() => navigate('/hiring/tasks')}
      />
    </div>
  );
}
