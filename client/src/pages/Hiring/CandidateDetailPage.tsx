/* eslint-disable i18next/no-literal-string */
import { useParams, useNavigate } from 'react-router-dom';
import CandidateDetail from '~/components/HiringPanel/CandidateDetail';
import { useHiringCandidate } from '~/hooks/useHiringCandidate';

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { candidate, loading, update } = useHiringCandidate(id);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        Candidate not found.
      </div>
    );
  }

  return (
    <CandidateDetail
      candidate={candidate}
      onBack={() => navigate('/hiring/team')}
      onUpdate={update}
    />
  );
}
