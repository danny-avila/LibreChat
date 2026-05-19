import { FC, memo } from 'react';
import { ModelData, REPORT_LABELS } from "~/store/reports";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import ChartContainer from "../ChartContainer";

const CustomTooltip: FC<any> = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 p-3 rounded-lg text-white text-sm shadow-lg">
          <p className="label font-bold mb-2">{label}</p>
          {payload.map((p, i) => (
            <p key={i} style={{ color: p.color }}>
              {`${p.name}: $${p.value?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

interface GraphModelsCostProps {
    filteredTopModels: ModelData[];
}

function GraphModelsCost({ filteredTopModels }: GraphModelsCostProps) {
    return (    
        <ChartContainer title={REPORT_LABELS.TYPES.MODELS_COST}>
            <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filteredTopModels} layout="vertical" margin={{ top: 5, right: 80, left: 30, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                    type="number" 
                    stroke="#9ca3af" 
                    fontSize={12} 
                    tickFormatter={(value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} 
                />
                <YAxis type="category" dataKey="name" stroke="#9ca3af" fontSize={12} width={80} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff10' }} />
                <Bar 
                    dataKey="Custo" 
                    radius={[0, 4, 4, 0]}
                    label={{ position: 'right', fill: '#ffffff', fontSize: 12, formatter: (value) => `$${typeof value === 'number' ? value.toFixed(2) : value}` }}
                >
                    {filteredTopModels.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                </Bar>
            </BarChart>
            </ResponsiveContainer>
        </ChartContainer>
    )
}

export default memo(GraphModelsCost);
