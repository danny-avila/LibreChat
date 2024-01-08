import { useState, useEffect } from 'react';
import MarkdownLite from './MarkdownLite';

export default function CodeAnalyze({
  initialProgress = 0.1,
  code,
  outputs = [],
}: {
  initialProgress: number;
  code: string;
  outputs: Record<string, unknown>[];
}) {
  const [progress, setProgress] = useState(initialProgress);
  const [showCode, setShowCode] = useState(false);

  const radius = 56.08695652173913;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    let timer: ReturnType<typeof setInterval>;
    if (initialProgress >= 1 && progress >= 1) {
      return;
    } else if (initialProgress >= 1 && progress < 1) {
      setProgress(0.99);
      timeout = setTimeout(() => {
        setProgress(1);
      }, 200);
    } else {
      timer = setInterval(() => {
        setProgress((prevProgress) => {
          if (prevProgress >= 1) {
            clearInterval(timer);
            return 1;
          }
          return Math.min(prevProgress + 0.007, 0.7);
        });
      }, 200);
    }

    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [progress, initialProgress]);

  // Calculate the stroke offset based on progress
  const offset = circumference - progress * circumference;

  const logs = outputs.reduce((acc, output) => {
    if (output['logs']) {
      return acc + output['logs'] + '\n';
    }
    return acc;
  }, '');

  return (
    <>
      <div className="my-2.5 flex items-center gap-2.5">
        <div className="relative h-5 w-5 shrink-0">
          {progress < 1 ? (
            <CodeInProgress offset={offset} circumference={circumference} radius={radius} />
          ) : (
            <CodeFinished />
          )}
        </div>
        <div className="text-token-text-secondary relative -mt-[0.75px] h-5 w-full leading-5">
          <div
            className="absolute left-0 top-0 line-clamp-1 overflow-visible"
            style={{ opacity: 1, transform: 'none' }}
            data-projection-id="78"
          >
            <button
              type="button"
              className="inline-flex items-center gap-1"
              onClick={() => setShowCode((prev) => !prev)}
            >
              {progress < 1 ? 'Analyzing' : 'Finished analyzing'}
              <svg width="16" height="17" viewBox="0 0 16 17" fill="none">
                <path
                  d="M11.3346 7.83203L8.00131 11.1654L4.66797 7.83203"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
      {showCode && (
        <div className="mb-3 mt-0.5 overflow-hidden rounded-xl bg-black">
          <MarkdownLite content={code ? `\`\`\`python\n${code}\n\`\`\`` : ''} />
          {logs && (
            <div className="bg-gray-700 p-4 text-xs">
              <div className="mb-1 text-gray-400">Result</div>
              <div
                className="prose flex flex-col-reverse text-white"
                style={{
                  color: 'white',
                }}
              >
                <pre className="shrink-0">{logs}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

const CodeInProgress = ({
  offset,
  circumference,
  radius,
}: {
  offset: number;
  circumference: number;
  radius: number;
}) => {
  return (
    <div
      className="absolute left-0 top-0 flex h-full w-full items-center justify-center rounded-full bg-transparent text-white"
      style={{ opacity: 1, transform: 'none' }}
      data-projection-id="77"
    >
      <div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
          viewBox="0 0 20 20"
          width="20"
          height="20"
          style={{ width: '100%', height: '100%', transform: 'translate3d(0px, 0px, 0px)' }}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <clipPath id="__lottie_element_11">
              <rect width="20" height="20" x="0" y="0" />
            </clipPath>
          </defs>
          <g clipPath="url(#__lottie_element_11)">
            <g style={{ display: 'block', transform: 'matrix(1,0,0,1,-2,-2)', opacity: 1 }}>
              <g opacity="1" transform="matrix(1,0,0,1,7.026679992675781,8.834091186523438)">
                <path
                  fill="rgb(177,98,253)"
                  fillOpacity="1"
                  d=" M1.2870399951934814,0.2207774966955185 C0.992609977722168,-0.07359249889850616 0.5152599811553955,-0.07359249889850616 0.22082999348640442,0.2207774966955185 C-0.07361000031232834,0.5151575207710266 -0.07361000031232834,0.992437481880188 0.22082999348640442,1.2868175506591797 C0.8473266959190369,1.9131841659545898 1.4738233089447021,2.53955078125 2.1003201007843018,3.16591739654541 C1.4738233089447021,3.7922842502593994 0.8473266959190369,4.4186506271362305 0.22082999348640442,5.045017719268799 C-0.07361000031232834,5.339417457580566 -0.07361000031232834,5.816617488861084 0.22082999348640442,6.11101770401001 C0.5152599811553955,6.405417442321777 0.992609977722168,6.405417442321777 1.2870399951934814,6.11101770401001 C2.091266632080078,5.306983947753906 2.895493268966675,4.502950668334961 3.6997199058532715,3.6989173889160156 C3.994119882583618,3.404517412185669 3.994119882583618,2.927217483520508 3.6997199058532715,2.6329174041748047 C2.895493268966675,1.8288708925247192 2.091266632080078,1.0248241424560547 1.2870399951934814,0.2207774966955185 C1.2870399951934814,0.2207774966955185 1.2870399951934814,0.2207774966955185 1.2870399951934814,0.2207774966955185 C1.2870399951934814,0.2207774966955185 1.2870399951934814,0.2207774966955185 1.2870399951934814,0.2207774966955185"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fillOpacity="0"
                  stroke="rgb(177,98,253)"
                  strokeOpacity="1"
                  strokeWidth="0.201031"
                  d=" M1.2870399951934814,0.2207774966955185 C0.992609977722168,-0.07359249889850616 0.5152599811553955,-0.07359249889850616 0.22082999348640442,0.2207774966955185 C-0.07361000031232834,0.5151575207710266 -0.07361000031232834,0.992437481880188 0.22082999348640442,1.2868175506591797 C0.8473266959190369,1.9131841659545898 1.4738233089447021,2.53955078125 2.1003201007843018,3.16591739654541 C1.4738233089447021,3.7922842502593994 0.8473266959190369,4.4186506271362305 0.22082999348640442,5.045017719268799 C-0.07361000031232834,5.339417457580566 -0.07361000031232834,5.816617488861084 0.22082999348640442,6.11101770401001 C0.5152599811553955,6.405417442321777 0.992609977722168,6.405417442321777 1.2870399951934814,6.11101770401001 C2.091266632080078,5.306983947753906 2.895493268966675,4.502950668334961 3.6997199058532715,3.6989173889160156 C3.994119882583618,3.404517412185669 3.994119882583618,2.927217483520508 3.6997199058532715,2.6329174041748047 C2.895493268966675,1.8288708925247192 2.091266632080078,1.0248241424560547 1.2870399951934814,0.2207774966955185 C1.2870399951934814,0.2207774966955185 1.2870399951934814,0.2207774966955185 1.2870399951934814,0.2207774966955185 C1.2870399951934814,0.2207774966955185 1.2870399951934814,0.2207774966955185 1.2870399951934814,0.2207774966955185"
                />
              </g>
            </g>
            <g style={{ display: 'block', transform: 'matrix(1,0,0,1,-2,-2)', opacity: 1 }}>
              <g opacity="1" transform="matrix(1,0,0,1,11.79640007019043,13.512199401855469)">
                <path
                  fill="rgb(177,98,253)"
                  fillOpacity="1"
                  d=" M4.3225998878479,0 C3.1498000621795654,0 1.9769999980926514,0 0.8041999936103821,0 C0.36010000109672546,0 0,0.36000001430511475 0,0.804099977016449 C0,1.2482000589370728 0.36010000109672546,1.6081000566482544 0.8041999936103821,1.6081000566482544 C1.9769999980926514,1.6081000566482544 3.1498000621795654,1.6081000566482544 4.3225998878479,1.6081000566482544 C4.7667999267578125,1.6081000566482544 5.126800060272217,1.2482000589370728 5.126800060272217,0.804099977016449 C5.126800060272217,0.36000001430511475 4.7667999267578125,0 4.3225998878479,0 C4.3225998878479,0 4.3225998878479,0 4.3225998878479,0 C4.3225998878479,0 4.3225998878479,0 4.3225998878479,0"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fillOpacity="0"
                  stroke="rgb(177,98,253)"
                  strokeOpacity="1"
                  strokeWidth="0.100515"
                  d=" M4.3225998878479,0 C3.1498000621795654,0 1.9769999980926514,0 0.8041999936103821,0 C0.36010000109672546,0 0,0.36000001430511475 0,0.804099977016449 C0,1.2482000589370728 0.36010000109672546,1.6081000566482544 0.8041999936103821,1.6081000566482544 C1.9769999980926514,1.6081000566482544 3.1498000621795654,1.6081000566482544 4.3225998878479,1.6081000566482544 C4.7667999267578125,1.6081000566482544 5.126800060272217,1.2482000589370728 5.126800060272217,0.804099977016449 C5.126800060272217,0.36000001430511475 4.7667999267578125,0 4.3225998878479,0 C4.3225998878479,0 4.3225998878479,0 4.3225998878479,0 C4.3225998878479,0 4.3225998878479,0 4.3225998878479,0"
                />
              </g>
            </g>
          </g>
        </svg>
      </div>
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        className="absolute left-1/2 top-1/2 h-[23px] w-[23px] -translate-x-1/2 -translate-y-1/2 text-brand-purple"
      >
        <circle
          className="origin-[50%_50%] -rotate-90 stroke-brand-purple/25 dark:stroke-brand-purple/50"
          strokeWidth="7.826086956521739"
          fill="transparent"
          r={radius}
          cx="60"
          cy="60"
        />
        <circle
          className="origin-[50%_50%] -rotate-90 transition-[stroke-dashoffset]"
          stroke="currentColor"
          strokeWidth="7.826086956521739"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          fill="transparent"
          r={radius}
          cx="60"
          cy="60"
        />
      </svg>
    </div>
  );
};

const CodeFinished = () => {
  return (
    <div
      className="absolute left-0 top-0 flex h-full w-full items-center justify-center rounded-full bg-brand-purple text-white"
      style={{ opacity: 1, transform: 'none' }}
      data-projection-id="162"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 9" fill="none" width="8" height="9">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M7.66607 0.376042C8.01072 0.605806 8.10385 1.07146 7.87408 1.4161L3.54075 7.9161C3.40573 8.11863 3.18083 8.24304 2.93752 8.24979C2.69421 8.25654 2.46275 8.1448 2.31671 7.95008L0.150044 5.06119C-0.098484 4.72982 -0.0313267 4.25972 0.300044 4.01119C0.631415 3.76266 1.10152 3.82982 1.35004 4.16119L2.88068 6.20204L6.62601 0.584055C6.85577 0.239408 7.32142 0.146278 7.66607 0.376042Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
};
