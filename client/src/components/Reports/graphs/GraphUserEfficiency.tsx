import { memo } from 'react';
import { UserData } from "~/store/reports";

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

interface GraphUserEfficiencyProps {
    userEfficiencyData: UserData[];
}

function GraphUserEfficiency({ userEfficiencyData }: GraphUserEfficiencyProps) {
    return (
        <ChartContainer title="Eficiência de Usuários - Custo por Mensagem">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={userEfficiencyData} layout="vertical" margin={{ top: 5, right: 60, left: 80, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" stroke="#9ca3af" fontSize={12} tickFormatter={(value) => `$${value.toFixed(3)}`} />
                    <YAxis 
                        type="category" 
                        dataKey="username" 
                        stroke="#9ca3af" 
                        fontSize={12} 
                        width={80}
                    />
                    <Tooltip 
                        content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                            const data = payload[0]?.payload;
                            return (
                            <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 p-3 rounded-lg text-white text-sm shadow-lg">
                                <p className="label font-bold mb-2">{data?.name || label}</p>
                                <p className="text-gray-300 text-xs mb-1">@{data?.username}</p>
                                <p className="text-blue-400">Volume: {data?.Volume} mensagens</p>
                                <p className="text-green-400">Custo Total: ${data?.Custo?.toFixed(2)}</p>
                                <p className="text-yellow-400">Custo/Mensagem: ${data?.CostPerMessage?.toFixed(4)}</p>
                            </div>
                            );
                        }
                        return null;
                        }}
                        cursor={{ fill: '#ffffff10' }} 
                    />
                    <Bar 
                        dataKey="CostPerMessage" 
                        radius={[0, 4, 4, 0]}
                        label={{ position: 'right', fill: '#ffffff', fontSize: 12, formatter: (value) => `$${typeof value === 'number' ? value.toFixed(3) : value}` }}
                    >
                        {userEfficiencyData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </ChartContainer>
    )
}

export default memo(GraphUserEfficiency);