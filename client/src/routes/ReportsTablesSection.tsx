import { lazy, Suspense } from 'react';
import { useReportStore } from '../store/reports';

const CostCentersTable = lazy(() => import('~/components/Reports/tables/CostCentersTable'));
const UserMessagesTable = lazy(() => import('~/components/Reports/tables/UserMessagesCostTable'));
const ModelsTable = lazy(() => import('~/components/Reports/tables/ModelsTable'));

function TableSkeleton() {
  return (
    <div className="mb-6 animate-pulse rounded-xl border border-gray-700/50 bg-[#1c1c1c] p-6">
      <div className="mb-4 h-6 w-48 rounded bg-gray-700/60" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-gray-800/50" />
        ))}
      </div>
    </div>
  );
}

export default function ReportsTablesSection() {
  const allTopCostCentersVolumeData = useReportStore((s) => s.allTopCostCentersVolumeData);
  const allTopUsersVolumeData = useReportStore((s) => s.allTopUsersVolumeData);
  const allTopModelsData = useReportStore((s) => s.allTopModelsData);
  const isLoadingCostCenters = useReportStore((s) => s.isLoadingCostCenters);
  const isLoadingTopUsers = useReportStore((s) => s.isLoadingTopUsers);
  const isLoadingTopModels = useReportStore((s) => s.isLoadingTopModels);

  return (
    <div className="mt-8">
      <h2 className="mb-6 text-2xl font-bold text-white">Tabelas Detalhadas</h2>

      <Suspense fallback={<TableSkeleton />}>
        <div className="mb-6">
          <CostCentersTable data={allTopCostCentersVolumeData} isLoading={isLoadingCostCenters} />
        </div>
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <div className="mb-6 grid grid-cols-1 gap-6">
          <UserMessagesTable data={allTopUsersVolumeData} isLoading={isLoadingTopUsers} />
        </div>
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <div className="mb-6">
          <ModelsTable data={allTopModelsData} isLoading={isLoadingTopModels} />
        </div>
      </Suspense>
    </div>
  );
}
