import MainKpis from '~/components/Reports/kpis/main';
import { useReportStore } from '../store/reports';

export default function ReportsKpisSection() {
  const kpiData = useReportStore((s) => s.kpiData);
  const filters = useReportStore((s) => s.filters);
  const setFilter = useReportStore((s) => s.setFilter);
  const clearFilters = useReportStore((s) => s.clearFilters);

  return (
    <MainKpis
      kpiData={
        kpiData ?? {
          totalCost: 0,
          newUsers: 0,
          activeAccounts: 0,
        }
      }
      filters={filters}
      setFilter={setFilter}
      clearFilters={clearFilters}
    />
  );
}
