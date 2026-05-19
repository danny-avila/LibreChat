import { REPORT_LABELS, ReportUtils, UsageCostData } from "~/store/reports";

import { memo, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

   // Transforma dados para incluir Total Mensagens calculado dinamicamente  




function GraphMessagesCost({ usageCostData, loading }: { usageCostData: UsageCostData[], loading: boolean }) {
    const chartData = useMemo(() => {
        return usageCostData.map(item => ({
          ...item,
          'Total Mensagens': item.QUESTIONS + item.ANSWERS // QUESTIONS (user) + ANSWERS (IA)
        }));
    }, [usageCostData]);
    


    return (
        <>
        <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">{REPORT_LABELS.TYPES.USAGE_COST}</h3>
              {loading && (
                <div className="text-blue-400 text-sm flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                  Carregando...
                </div>
              )}
            </div>
            <div className="h-[250px] w-full">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-gray-400">Carregando dados...</div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="#8b5cf6" fontSize={12} tickLine={false} axisLine={false} label={{ value: 'Mensagens', angle: -90, position: 'insideLeft', fill: '#8b5cf6', style: {textAnchor: 'middle'} }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" fontSize={12} tickLine={false} axisLine={false} label={{ value: 'Custo (USD)', angle: -90, position: 'insideRight', fill: '#3b82f6', style: {textAnchor: 'middle'} }} tickFormatter={(value) => `$${value}`} />
                  <Tooltip content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                      return (
                          <div className="bg-gray-900/90 backdrop-blur-sm border border-gray-700 p-3 rounded-lg text-white text-sm shadow-lg">
                          <p className="label font-bold mb-2">{label}</p>
                          {payload.map((p, i) => (
                              <p key={i} style={{ color: p.color }}>

                              {`${p.name}: ${p.name?.includes('Custo') ? 
                                  `$${p.value?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 
                                  p.value?.toLocaleString('pt-BR')
                              }`}
                              </p>
                          ))}
                          </div>
                      );
                      }
                      return null;
                  }} />
                  <Legend />
                  {/* Total de Mensagens (QUESTIONS + ANSWERS) - calculado dinamicamente */}
                  <Area yAxisId="left" type="monotone" dataKey="Total Mensagens" stroke={ReportUtils.getUsageCostDetailedColor('TOTAL_MESSAGES')} fill={ReportUtils.getUsageCostDetailedColor('TOTAL_MESSAGES')} fillOpacity={0.0} name={`${REPORT_LABELS.GRAPHS.TOTAL_MESSAGES}`} />
                  {/* Custos separados - ANSWERS e QUESTIONS */}
                  <Area yAxisId="right" type="monotone" dataKey="ANSWERS custo" stroke={ReportUtils.getUsageCostDetailedColor('ANSWERS_COST')} fill={ReportUtils.getUsageCostDetailedColor('ANSWERS_COST')} fillOpacity={0.0} name={`${REPORT_LABELS.GRAPHS.ANSWERS_COST}`} />
                  <Area yAxisId="right" type="monotone" dataKey="QUESTIONS custo" stroke={ReportUtils.getUsageCostDetailedColor('QUESTIONS_COST')} fill={ReportUtils.getUsageCostDetailedColor('QUESTIONS_COST')} fillOpacity={0.0} name={`${REPORT_LABELS.GRAPHS.QUESTIONS_COST}`} />


                  </AreaChart>
              </ResponsiveContainer>
              )}
            </div>
        </>
    )
}

export default memo(GraphMessagesCost);

