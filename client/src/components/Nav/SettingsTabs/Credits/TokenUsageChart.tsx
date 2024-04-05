import React, { useEffect, useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import axios from 'axios';

const dataOptions: ApexOptions = {
  chart: {
    id: 'credit-usage-chart',
  },
  plotOptions: {
    bar: {
      borderRadius: 5,
      dataLabels: {
        position: 'top', // top, center, bottom
      },
    },
  },
  dataLabels: {
    enabled: true,
    formatter: function (val: number) {
      return val >= 1e3 ? (val / 1e3).toFixed(2) + 'k' : val;
    },
    offsetY: -20,
    style: {
      fontSize: '12px',
      colors: ['#304758'],
    },
  },
  xaxis: {
    categories: ['Sun', 'Mon', 'Tue', 'Wed', 'Thur', 'Fri', 'Sat'],
  },
  yaxis: [
    {
      labels: {
        formatter: (val) => (val >= 1e3 ? (val / 1e3).toFixed(2) + 'k' : val.toFixed(0)),
      },
      stepSize: 1,
      floating: false,
      title: {
        text: 'credits',
      },
    },
  ],
  colors: ['#06a06d', '#df1f1f'],
};

export default function TokenUsageChart() {
  const [usage, setUsage] = useState<
    { inputTokens: number; outputTokens: number; count: number }[]
  >(new Array(7).fill({ inputTokens: 0, outputTokens: 0, count: 0 }));

  useEffect(() => {
    getCreditUsage();
  }, []);

  const getCreditUsage = () => {
    const today = new Date();
    axios({
      method: 'get',
      url: `/api/credits/usage?date=${today.toISOString().slice(0, 10)}`,
      withCredentials: true,
    })
      .then((res) => {
        const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
        const data = new Array(7).fill('').map((i, j) => {
          const date = new Date(startOfWeek);
          date.setDate(startOfWeek.getDate() + j);

          const searchResult = res.data.filter(
            (k) => new Date(k._id).toLocaleDateString() === date.toLocaleDateString(),
          )[0];

          return searchResult
            ? searchResult
            : { _id: date.toLocaleDateString(), inputTokens: 0, outputTokens: 0, count: 0 };
        });
        setUsage(data);
      })
      .catch((err) => console.error(err));
  };

  return (
    <div className="row px-3">
      <ReactApexChart
        options={dataOptions}
        series={[
          {
            name: 'Credits',
            data: usage.map((i) => i.count),
          },
          // {
          //   name: 'Input Tokens',
          //   data: usage.map((i) => i.inputTokens),
          // },
          // {
          //   name: 'Output Tokens',
          //   data: usage.map((i) => i.outputTokens),
          // },
        ]}
        type="bar"
        width="450"
      />
    </div>
  );
}
