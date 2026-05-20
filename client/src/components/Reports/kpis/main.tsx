import { KPIData, REPORT_LABELS } from '~/store/reports';
import KPICard from './KPICard';

import { ReportFilters } from '~/store/reports';

interface MainKpisProps {
  kpiData: KPIData;
  filters: ReportFilters;
  setFilter: (filterType: keyof ReportFilters, value: string) => void;
  clearFilters: () => void;
}

export default function MainKpis({ kpiData, filters, setFilter, clearFilters }: MainKpisProps) {
  return (
    <div>
      <div className="mb-4 rounded-xl border border-gray-700/50 bg-[#1c1c1c] p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3 xl:flex-nowrap xl:gap-4">
          {/* Logo HPE */}
          <div className="flex-shrink-0">
            <img
              src="/assets/hpe-ia-neural-dark-mode.png"
              alt="HPE IA Neural Logo"
              className="h-14 w-auto rounded-lg bg-white p-2"
            />
          </div>

          {/* Filtros de Data */}
          <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-4">
            <div>
              <label className="mb-1 block text-xs text-gray-400">De:</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilter('startDate', e.target.value)}
                className="w-36 rounded-lg border border-gray-600/50 bg-gray-800/50 p-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 sm:w-40"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Até:</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilter('endDate', e.target.value)}
                className="w-36 rounded-lg border border-gray-600/50 bg-gray-800/50 p-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 sm:w-40"
              />
            </div>
          </div>

          {/* Botão Limpar Filtros */}
          <div className="w-full flex-shrink-0 sm:w-auto">
            <button
              onClick={() => clearFilters()}
              className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 sm:w-auto"
            >
              Limpar Filtros
            </button>
          </div>

          {/* KPIs */}
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            <div className="min-w-[200px] flex-1">
              <KPICard
                title={REPORT_LABELS.KPIS.TOTAL_REVENUE}
                value={`$${(kpiData?.totalCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                change="Período selecionado"
                changeType="positive"
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <KPICard
                title={REPORT_LABELS.KPIS.MEMORY_COST}
                value={`$${(kpiData?.memoryCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                change="MemoryRun (context: memory)"
                changeType="positive"
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <KPICard
                title={REPORT_LABELS.KPIS.NEW_USERS}
                value={(kpiData?.newUsers || 0).toString()}
                change="Período selecionado"
                changeType="positive"
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <KPICard
                title={REPORT_LABELS.KPIS.ACTIVE_USERS}
                value={(kpiData?.activeAccounts || 0).toString()}
                change="Cadastrados no sistema"
                changeType="positive"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
