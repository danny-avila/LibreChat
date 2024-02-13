import { cn } from '~/utils';

export default function VeraSpinner({ className = 'm-auto' }) {
  return (
    <svg
      className={cn(className, 'animate-spin text-center')}
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
    >
      <rect width="32" height="32" fill="url(#pattern0)" />
      <g clipPath="url(#clip0_85_3422)">
        <path
          opacity="0.05"
          d="M25.1666 16C25.1666 14.2605 24.6717 12.5569 23.7396 11.0882C22.8075 9.61952 21.4768 8.44635 19.9029 7.70571"
          stroke="#19D8CA"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          opacity="0.1"
          d="M25.1666 16C25.1666 13.6684 24.2782 11.4245 22.6821 9.72495"
          stroke="#19D8CA"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          opacity="0.3"
          d="M25.1666 16C25.1666 14.8446 24.9482 13.6997 24.5229 12.6255"
          stroke="#19D8CA"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M24.6666 16C24.6666 15.9818 24.6665 15.9637 24.6664 15.9455"
          stroke="#19D8CA"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      <g clipPath="url(#clip1_85_3422)">
        <path
          opacity="0.05"
          d="M11.4165 8.0614C9.9101 8.93114 8.68223 10.2115 7.87633 11.7531C7.07044 13.2946 6.71979 15.0336 6.86535 16.767"
          stroke="#3F5AFF"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          opacity="0.1"
          d="M11.4165 8.0614C9.39738 9.22715 7.89832 11.1185 7.22444 13.3505"
          stroke="#3F5AFF"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          opacity="0.3"
          d="M11.4165 8.0614C10.416 8.63907 9.53365 9.40068 8.81601 10.3061"
          stroke="#3F5AFF"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M11.6665 8.49441C11.6508 8.50349 11.6351 8.51261 11.6195 8.52179"
          stroke="#3F5AFF"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      <g clipPath="url(#clip2_85_3422)">
        <path
          opacity="0.05"
          d="M11.4166 23.9386C12.9231 24.8083 14.6459 25.2315 16.3838 25.1586C18.1218 25.0858 19.8031 24.52 21.2315 23.5272"
          stroke="#30A9E5"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          opacity="0.1"
          d="M11.4166 23.9386C13.4358 25.1043 15.8233 25.4569 18.0932 24.9245"
          stroke="#30A9E5"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          opacity="0.3"
          d="M11.4166 23.9386C12.4172 24.5163 13.5179 24.8996 14.6609 25.0683"
          stroke="#30A9E5"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M11.6666 23.5056C11.6824 23.5146 11.6981 23.5237 11.7139 23.5326"
          stroke="#30A9E5"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      <defs>
        <pattern id="pattern0" patternContentUnits="objectBoundingBox" width="1" height="1">
          <use xlinkHref="#image0_85_3422" />
        </pattern>
        <clipPath id="clip0_85_3422">
          <rect
            width="21.3333"
            height="21.3333"
            fill="white"
            transform="translate(5.33325 5.33331)"
          />
        </clipPath>
        <clipPath id="clip1_85_3422">
          <rect
            width="21.3333"
            height="21.3333"
            fill="white"
            transform="translate(12.0957 30.5709) rotate(-120)"
          />
        </clipPath>
        <clipPath id="clip2_85_3422">
          <rect
            width="21.3333"
            height="21.3333"
            fill="white"
            transform="translate(30.5708 12.0958) rotate(120)"
          />
        </clipPath>
        <image
          id="image0_85_3422"
          width="1"
          height="1"
          xlinkHref="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAQSURBVHgBAQUA+v8AAAAAAAAFAAFkeJU4AAAAAElFTkSuQmCC"
        />
      </defs>
    </svg>
  );
}
