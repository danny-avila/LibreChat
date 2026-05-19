import { memo } from 'react';
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
import { REPORT_LABELS, UserData } from "~/store/reports";
import ChartContainer from '../ChartContainer';
    
interface GraphUserCostProps {
    filteredTopUsersCost: UserData[];
}

function GraphUserCost({ filteredTopUsersCost }: GraphUserCostProps) {
    return (
    <ChartContainer title={REPORT_LABELS.TYPES.TOP_USERS_COST}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredTopUsersCost} layout="vertical" margin={{ top: 5, right: 80, left: 30, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" stroke="#9ca3af" fontSize={12} tickFormatter={(value) => `$${value}`} />
                  <YAxis 
                    type="category" 
                    dataKey="username" 
                    stroke="#9ca3af" 
                    fontSize={12} 
                    width={80}
                    tickFormatter={(value, index) => {
                      const item = filteredTopUsersCost[index];
                      return item?.username || value;
                    }}
                  />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0]?.payload;
                        return (
                          <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 p-3 rounded-lg text-white text-sm shadow-lg">
                            <p className="label font-bold mb-2">{data?.name || label}</p>
                            <p className="text-gray-300 text-xs mb-1">@{data?.username}</p>
                            {payload.map((p, i) => (
                              <p key={i} style={{ color: p.color }}>
                                {`${p.name}: ${p.name === 'Custo' ? 
                                  `$${p.value?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 
                                  p.value?.toLocaleString('pt-BR')
                                }`}
                              </p>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    }}
                    cursor={{ fill: '#ffffff10' }} 
                  />
                  <Bar 
                    dataKey="Custo" 
                    radius={[0, 4, 4, 0]}
                    label={{ position: 'right', fill: '#ffffff', fontSize: 12, formatter: (value) => `$${value}` }}
                  >
                    {filteredTopUsersCost.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
    )
}

export default memo(GraphUserCost);