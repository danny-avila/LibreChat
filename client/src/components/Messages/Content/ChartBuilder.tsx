import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

const ChartBuilder = ({ identifier, type, title, data }) => {
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Strong validation logic
    if (!Array.isArray(data) || data.length === 0) return;
    if (!['line', 'bar', 'pie'].includes(type)) return;

    const chartInstance = echarts.init(chartRef.current);
    let option = {};

    try {
      if (type === 'pie') {
        // For pie chart, transform data to name-value pairs
        const pieData = data
          .map((item) => {
            if (typeof item !== 'object' || item === null) return null;

            // Handle both label/value and generic key structures
            const labelKey = item.label !== undefined ? 'label' : Object.keys(item)[0];
            const valueKey = item.value !== undefined ? 'value' : Object.keys(item)[1];

            if (!labelKey || !valueKey) return null;

            return {
              name: item[labelKey],
              value: Number(item[valueKey]) || 0,
            };
          })
          .filter(Boolean);

        if (pieData.length === 0) return;

        option = {
          title: {
            text: title,
            left: 'center',
            textStyle: {
              fontSize: 16,
              fontWeight: 'bold',
            },
          },
          tooltip: {
            trigger: 'item',
            formatter: '{a} <br/>{b}: {c} ({d}%)',
          },
          legend: {
            orient: 'vertical',
            left: 'left',
          },
          series: [
            {
              name: title,
              type: 'pie',
              radius: '60%',
              data: pieData,
              emphasis: {
                itemStyle: {
                  shadowBlur: 10,
                  shadowOffsetX: 0,
                  shadowColor: 'rgba(0, 0, 0, 0.5)',
                },
              },
            },
          ],
        };
      } else {
        // For line or bar charts
        const firstItem = data[0];
        if (!firstItem) return;

        // Handle both label/value and generic key structures
        const labelKey = firstItem.label !== undefined ? 'label' : Object.keys(firstItem)[0];
        const valueKey = firstItem.value !== undefined ? 'value' : Object.keys(firstItem)[1];

        if (!labelKey || !valueKey) return;

        const categories = data.map((item) => item[labelKey]);
        const values = data.map((item) => Number(item[valueKey]) || 0);

        option = {
          title: {
            text: title,
            left: 'center',
            textStyle: {
              fontSize: 16,
              fontWeight: 'bold',
            },
          },
          tooltip: {
            trigger: 'axis',
          },
          xAxis: {
            type: 'category',
            data: categories,
            axisLabel: {
              rotate: 45,
              interval: 0,
            },
          },
          yAxis: {
            type: 'value',
          },
          series: [
            {
              data: values,
              type: type,
              smooth: type === 'line',
              itemStyle: {
                borderRadius: type === 'bar' ? [4, 4, 0, 0] : 0,
              },
            },
          ],
        };
      }

      chartInstance.setOption(option);
    } catch (error) {
      console.error('Error rendering chart:', error);
      return;
    }

    return () => {
      chartInstance.dispose();
    };
  }, [identifier, type, title, data]);

  return (
    <div
      ref={chartRef}
      style={{
        width: '100%',
        height: 400,
        minHeight: 300,
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '10px',
      }}
    />
  );
};

export default ChartBuilder;
