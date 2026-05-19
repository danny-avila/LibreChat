import { useEffect, useState } from 'react';
import { useReportStore } from '../store/reports';
import ReportsChartsSection from './ReportsChartsSection';
import ReportsKpisSection from './ReportsKpisSection';
import ReportsTablesSection from './ReportsTablesSection';

const FILTER_DEBOUNCE_MS = 400;

export default function Reports() {
  const filters = useReportStore((s) => s.filters);
  const fetchAllData = useReportStore((s) => s.fetchAllData);

  const [debouncedFilterKey, setDebouncedFilterKey] = useState(() =>
    JSON.stringify({
      startDate: filters.startDate,
      endDate: filters.endDate,
      costCenter: filters.costCenter,
    }),
  );

  useEffect(() => {
    const key = JSON.stringify({
      startDate: filters.startDate,
      endDate: filters.endDate,
      costCenter: filters.costCenter,
    });
    const timer = setTimeout(() => setDebouncedFilterKey(key), FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters.startDate, filters.endDate, filters.costCenter]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData, debouncedFilterKey]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] p-4 font-sans text-white sm:p-6 lg:p-8">
      <div className="w-full">
        <ReportsKpisSection />
        <ReportsChartsSection />
        <ReportsTablesSection />
      </div>
    </div>
  );
}
