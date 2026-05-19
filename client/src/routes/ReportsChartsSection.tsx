import GraphCCcost from '~/components/Reports/graphs/GraphCCcost';
import GraphCCmessages from '~/components/Reports/graphs/GraphCCmessages';
import GraphMessagesCost from '~/components/Reports/graphs/GraphMessagesCost';
import GraphModelsCost from '~/components/Reports/graphs/GraphModelsCost';
import GraphModelsMessage from '~/components/Reports/graphs/GraphModelsMessage';
import GraphUserCost from '~/components/Reports/graphs/GraphUserCost';
import GraphUserEfficiency from '~/components/Reports/graphs/GraphUserEfficiency';
import GraphUserMessages from '~/components/Reports/graphs/GraphUserMessages';
import { useReportStore } from '../store/reports';

export default function ReportsChartsSection() {
  const usageCostData = useReportStore((s) => s.usageCostData);
  const isLoadingUsageCost = useReportStore((s) => s.isLoadingUsageCost);

  const topCostCentersVolumeData = useReportStore((s) => s.topCostCentersVolumeData);
  const topCostCentersCostData = useReportStore((s) => s.topCostCentersCostData);

  const topUsersVolumeData = useReportStore((s) => s.topUsersVolumeData);
  const topUsersCostData = useReportStore((s) => s.topUsersCostData);

  const topModelsData = useReportStore((s) => s.topModelsData);
  const topModelsCostData = useReportStore((s) => s.topModelsCostData);

  const userEfficiencyData = useReportStore((s) => s.userEfficiencyData);

  return (
    <>
      <div className="mb-4 rounded-xl border border-gray-700/50 bg-[#1c1c1c] p-5">
        <GraphMessagesCost usageCostData={usageCostData} loading={isLoadingUsageCost} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GraphCCmessages filteredTopCostCenters={topCostCentersVolumeData} />
        <GraphCCcost filteredTopCostCenters={topCostCentersCostData} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GraphUserMessages filteredTopUsersVolume={topUsersVolumeData} />
        <GraphUserCost filteredTopUsersCost={topUsersCostData} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GraphModelsMessage filteredTopModels={topModelsData} />
        <GraphModelsCost filteredTopModels={topModelsCostData} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <GraphUserEfficiency userEfficiencyData={userEfficiencyData} />
        </div>
      </div>
    </>
  );
}
