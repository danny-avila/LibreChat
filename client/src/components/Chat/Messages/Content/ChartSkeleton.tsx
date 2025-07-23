const ChartSkeleton = () => {
  // Match the same dimensions as your actual chart
  const titleHeight = 50;
  const legendHeight = 35; // Show legend skeleton for multi-series case
  const yLabelWidth = 50;
  const xLabelHeight = 40;
  const chartHeight = 350;
  const totalHeight = titleHeight + legendHeight + chartHeight + xLabelHeight;

  return (
    <div className="my-6">
      {/* Chart Toggle Skeleton */}
      <div className="mb-4 flex w-fit items-center rounded-lg bg-gray-100 p-1 dark:bg-slate-800/50">
        <div className="flex items-center gap-2 rounded-md px-3 py-1.5">
          <div className="h-4 w-4 animate-pulse rounded bg-gray-300 dark:bg-slate-600"></div>
          <div className="h-4 w-16 animate-pulse rounded bg-gray-300 dark:bg-slate-600"></div>
        </div>
        <div className="flex items-center gap-2 rounded-md px-3 py-1.5">
          <div className="h-4 w-4 animate-pulse rounded bg-gray-300 dark:bg-slate-600"></div>
          <div className="h-4 w-16 animate-pulse rounded bg-gray-300 dark:bg-slate-600"></div>
        </div>
      </div>

      {/* Chart Container Skeleton - Fixed 5-container layout */}
      <div className="flex justify-center">
        <div
          className="relative rounded-lg border bg-white dark:border-slate-700 dark:bg-slate-900"
          style={{ width: '700px', height: `${totalHeight}px` }}
        >
          {/* Container 1: Title Skeleton */}
          <div
            className="absolute left-0 right-0 top-0 flex items-center justify-center py-3"
            style={{ height: `${titleHeight}px` }}
          >
            <div className="h-5 w-48 animate-pulse rounded bg-gray-300 dark:bg-slate-600"></div>
          </div>

          {/* Container 2: Legend Skeleton */}
          <div
            className="absolute left-0 right-0 flex items-center justify-center gap-4"
            style={{
              top: `${titleHeight}px`,
              height: `${legendHeight}px`,
            }}
          >
            {/* Multiple legend items skeleton */}
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-3 w-3 animate-pulse rounded bg-gray-300 dark:bg-slate-600"></div>
                <div className="h-3 w-16 animate-pulse rounded bg-gray-300 dark:bg-slate-600"></div>
              </div>
            ))}
          </div>

          {/* Container 3: Y-Axis Label Skeleton */}
          <div
            className="absolute left-0 flex items-center justify-center"
            style={{
              top: `${titleHeight + legendHeight}px`,
              width: `${yLabelWidth}px`,
              height: `${chartHeight}px`,
            }}
          >
            <div
              className="-rotate-90 transform whitespace-nowrap"
              style={{ transformOrigin: 'center' }}
            >
              <div className="h-4 w-20 animate-pulse rounded bg-gray-300 dark:bg-slate-600"></div>
            </div>
          </div>

          {/* Container 4: Chart Area Skeleton */}
          <div
            className="absolute p-2"
            style={{
              top: `${titleHeight + legendHeight}px`,
              left: `${yLabelWidth}px`,
              right: '0px',
              height: `${chartHeight}px`,
            }}
          >
            <div className="relative h-full w-full">
              {/* Chart bars skeleton with proper spacing */}
              <div className="absolute inset-x-8 bottom-12 top-8 flex items-end justify-around gap-1">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-t bg-gray-300 dark:bg-slate-600"
                    style={{
                      height: `${Math.random() * 60 + 25}%`,
                      width: '14%',
                      animationDelay: `${i * 0.1}s`, // Staggered animation
                    }}
                  ></div>
                ))}
              </div>

              {/* Y-axis scale labels skeleton */}
              <div className="absolute bottom-12 left-2 top-8 flex flex-col justify-between">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-3 w-8 animate-pulse rounded bg-gray-300 dark:bg-slate-600"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  ></div>
                ))}
              </div>

              {/* X-axis scale labels skeleton */}
              <div className="absolute bottom-4 left-8 right-8 flex justify-around">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="h-3 w-10 animate-pulse rounded bg-gray-300 dark:bg-slate-600"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  ></div>
                ))}
              </div>
            </div>
          </div>

          {/* Container 5: X-Axis Label Skeleton */}
          <div
            className="absolute left-0 right-0 flex items-center justify-center py-2"
            style={{
              top: `${titleHeight + legendHeight + chartHeight}px`,
              height: `${xLabelHeight}px`,
            }}
          >
            <div className="h-4 w-24 animate-pulse rounded bg-gray-300 dark:bg-slate-600"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChartSkeleton;
