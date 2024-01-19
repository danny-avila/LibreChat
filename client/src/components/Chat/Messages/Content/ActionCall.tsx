import { useState, useEffect } from 'react';
import ProgressCircle from './ProgressCircle';

export default function ActionCall({
  initialProgress = 0.1,
  args = '',
}: {
  initialProgress: number;
  args: string;
}) {
  const [progress, setProgress] = useState(initialProgress);
  // const [showDetails, setShowDetails] = useState(false);

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

  return (
    <div className="relative h-5 w-5 shrink-0">
      <div
        className="absolute left-0 top-0 flex h-full w-full items-center justify-center rounded-full bg-transparent text-white"
        style={{ opacity: 1, transform: 'none' }}
        data-projection-id="849"
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
              <clipPath id="__lottie_element_232">
                <rect width="20" height="20" x="0" y="0"></rect>
              </clipPath>
              <clipPath id="__lottie_element_242">
                <path d="M0,0 L20000,0 L20000,20000 L0,20000z"></path>
              </clipPath>
              <g id="__lottie_element_245">
                <g
                  clipPath="url(#__lottie_element_246)"
                  style={{ display: 'block' }}
                  transform="matrix(1,0,0,1,0,0)"
                  opacity="1"
                >
                  <g
                    style={{ display: 'block' }}
                    transform="matrix(1,0,0,1,10006,10006)"
                    opacity="1"
                  >
                    <g opacity="1" transform="matrix(1,0,0,1,0,0)">
                      <path
                        fill="rgb(255,255,255)"
                        fillOpacity="1"
                        d=" M4.5,1 C4.5,1 4.5,3.5 4.5,3.5 C4.5,4.05 4.05,4.5 3.5,4.5 C3.5,4.5 1,4.5 1,4.5 C0.45,4.5 0,4.05 0,3.5 C0,3.5 0,1 0,1 C0,0.45 0.45,0 1,0 C1,0 3.5,0 3.5,0 C4.05,0 4.5,0.45 4.5,1z"
                      ></path>
                      <g opacity="1" transform="matrix(1,0,0,1,2.25,2.25)"></g>
                    </g>
                  </g>
                </g>
              </g>
              <clipPath id="__lottie_element_246">
                <path d="M0,0 L20000,0 L20000,20000 L0,20000z"></path>
              </clipPath>
              <clipPath id="__lottie_element_256">
                <path d="M0,0 L20000,0 L20000,20000 L0,20000z"></path>
              </clipPath>
              {/* eslint-disable-next-line react/no-unknown-property */}
              <mask id="__lottie_element_245_1" mask-type="alpha">
                <use xlinkHref="#__lottie_element_245"></use>
              </mask>
              <clipPath id="__lottie_element_269">
                <path d="M0,0 L20000,0 L20000,20000 L0,20000z"></path>
              </clipPath>
              <g id="__lottie_element_272">
                <g
                  clipPath="url(#__lottie_element_273)"
                  style={{ display: 'block' }}
                  transform="matrix(1,0,0,1,0,0)"
                  opacity="1"
                >
                  <g
                    style={{ display: 'block' }}
                    transform="matrix(1,0,0,1,10006,10006)"
                    opacity="1"
                  >
                    <g opacity="1" transform="matrix(1,0,0,1,0,0)">
                      <path
                        fill="rgb(255,255,255)"
                        fillOpacity="1"
                        d=" M4.5,1 C4.5,1 4.5,3.5 4.5,3.5 C4.5,4.05 4.05,4.5 3.5,4.5 C3.5,4.5 1,4.5 1,4.5 C0.45,4.5 0,4.05 0,3.5 C0,3.5 0,1 0,1 C0,0.45 0.45,0 1,0 C1,0 3.5,0 3.5,0 C4.05,0 4.5,0.45 4.5,1z"
                      ></path>
                      <g opacity="1" transform="matrix(1,0,0,1,2.25,2.25)"></g>
                    </g>
                  </g>
                </g>
              </g>
              <clipPath id="__lottie_element_273">
                <path d="M0,0 L20000,0 L20000,20000 L0,20000z"></path>
              </clipPath>
              <clipPath id="__lottie_element_283">
                <path d="M0,0 L20000,0 L20000,20000 L0,20000z"></path>
              </clipPath>
              {/* eslint-disable-next-line react/no-unknown-property */}
              <mask id="__lottie_element_272_1" mask-type="alpha">
                <use xlinkHref="#__lottie_element_272"></use>
              </mask>
            </defs>
            <g clipPath="url(#__lottie_element_232)">
              <g
                clipPath="url(#__lottie_element_269)"
                style={{ display: 'block' }}
                transform="matrix(-1,0,0,-1,10014,10018.5)"
                opacity="1"
              >
                <g style={{ display: 'block' }} mask="url(#__lottie_element_272_1)">
                  <g
                    clipPath="url(#__lottie_element_283)"
                    transform="matrix(1,0,0,1,0,0)"
                    opacity="1"
                  >
                    <g
                      style={{ display: 'block' }}
                      transform="matrix(1,0,0,1,10006,10006)"
                      opacity="1"
                    >
                      <g opacity="1" transform="matrix(1,0,0,1,0,0)">
                        <path
                          fill="rgb(177,98,253)"
                          fillOpacity="1"
                          d=" M4.5,1 C4.5,1 4.5,3.5 4.5,3.5 C4.5,4.05 4.05,4.5 3.5,4.5 C3.5,4.5 1,4.5 1,4.5 C0.45,4.5 0,4.05 0,3.5 C0,3.5 0,1 0,1 C0,0.45 0.45,0 1,0 C1,0 3.5,0 3.5,0 C4.05,0 4.5,0.45 4.5,1z"
                        ></path>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fillOpacity="0"
                          stroke="rgb(177,98,253)"
                          strokeOpacity="1"
                          strokeWidth="3"
                          d=" M4.5,1 C4.5,1 4.5,3.5 4.5,3.5 C4.5,4.05 4.05,4.5 3.5,4.5 C3.5,4.5 1,4.5 1,4.5 C0.45,4.5 0,4.05 0,3.5 C0,3.5 0,1 0,1 C0,0.45 0.45,0 1,0 C1,0 3.5,0 3.5,0 C4.05,0 4.5,0.45 4.5,1z"
                        ></path>
                        <g opacity="1" transform="matrix(1,0,0,1,2.25,2.25)"></g>
                      </g>
                    </g>
                  </g>
                </g>
              </g>
              <g style={{ display: 'block' }} transform="matrix(-1,0,0,-1,5.75,10.25)" opacity="1">
                <g opacity="1" transform="matrix(1,0,0,1,-2.25,-0.75)">
                  <path
                    fill="rgb(247,247,248)"
                    fillOpacity="1"
                    d=" M0,0 C0.75,0 1.5,0 2.25,0 C2.6642000675201416,0 3,0.3357999920845032 3,0.75 C3,0.75 3,0.75 3,0.75 C3,1.164199948310852 2.6642000675201416,1.5 2.25,1.5 C1.5,1.5 0.75,1.5 0,1.5 C0,1 0,0.5 0,0 C0,0 0,0 0,0 C0,0 0,0 0,0"
                  ></path>
                </g>
              </g>
              <g
                clipPath="url(#__lottie_element_242)"
                style={{ display: 'block' }}
                transform="matrix(-1,0,0,-1,10022.5,10018.5)"
                opacity="1"
              >
                <g style={{ display: 'block' }} mask="url(#__lottie_element_245_1)">
                  <g
                    clipPath="url(#__lottie_element_256)"
                    transform="matrix(1,0,0,1,0,0)"
                    opacity="1"
                  >
                    <g
                      style={{ display: 'block' }}
                      transform="matrix(1,0,0,1,10006,10006)"
                      opacity="1"
                    >
                      <g opacity="1" transform="matrix(1,0,0,1,0,0)">
                        <path
                          fill="rgb(177,98,253)"
                          fillOpacity="1"
                          d=" M4.5,1 C4.5,1 4.5,3.5 4.5,3.5 C4.5,4.05 4.05,4.5 3.5,4.5 C3.5,4.5 1,4.5 1,4.5 C0.45,4.5 0,4.05 0,3.5 C0,3.5 0,1 0,1 C0,0.45 0.45,0 1,0 C1,0 3.5,0 3.5,0 C4.05,0 4.5,0.45 4.5,1z"
                        ></path>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fillOpacity="0"
                          stroke="rgb(177,98,253)"
                          strokeOpacity="1"
                          strokeWidth="3"
                          d=" M4.5,1 C4.5,1 4.5,3.5 4.5,3.5 C4.5,4.05 4.05,4.5 3.5,4.5 C3.5,4.5 1,4.5 1,4.5 C0.45,4.5 0,4.05 0,3.5 C0,3.5 0,1 0,1 C0,0.45 0.45,0 1,0 C1,0 3.5,0 3.5,0 C4.05,0 4.5,0.45 4.5,1z"
                        ></path>
                        <g opacity="1" transform="matrix(1,0,0,1,2.25,2.25)"></g>
                      </g>
                    </g>
                  </g>
                </g>
              </g>
              <g style={{ display: 'block' }} transform="matrix(-1,0,0,-1,14.25,10.25)" opacity="1">
                <g opacity="1" transform="matrix(1,0,0,1,-0.75,-0.75)">
                  <path
                    fill="rgb(247,247,248)"
                    fillOpacity="1"
                    d=" M0,0.75 C0,0.3357999920845032 0.3357900083065033,0 0.75,0 C1.5,0 2.25,0 3,0 C3,0.5 3,1 3,1.5 C2.25,1.5 1.5,1.5 0.75,1.5 C0.3357900083065033,1.5 0,1.164199948310852 0,0.75 C0,0.75 0,0.75 0,0.75 C0,0.75 0,0.75 0,0.75 C0,0.75 0,0.75 0,0.75"
                  ></path>
                </g>
              </g>
              <g style={{ display: 'block' }} transform="matrix(1,0,0,1,0,0)" opacity="1">
                <g opacity="1" transform="matrix(1,0,0,1,10,10.25)">
                  <path
                    fill="rgb(177,98,253)"
                    fillOpacity="1"
                    d=" M2,-0.75 C2,-0.75 2,0.75 2,0.75 C2,0.75 -2,0.75 -2,0.75 C-2,0.75 -2,-0.75 -2,-0.75 C-2,-0.75 2,-0.75 2,-0.75z"
                  ></path>
                </g>
              </g>
            </g>
          </svg>
        </div>
        <ProgressCircle radius={radius} circumference={circumference} offset={offset} />
      </div>
    </div>
  );
}
