import { cn } from '~/utils';
export default function EthIcon({
  size = 25,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 25 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12.5 25.5C19.4036 25.5 25 19.9036 25 13C25 6.09644 19.4036 0.5 12.5 0.5C5.59644 0.5 0 6.09644 0 13C0 19.9036 5.59644 25.5 12.5 25.5Z"
        fill="#627EEA"
      />
      <path
        d="M12.8891 3.625V10.5547L18.7461 13.1719L12.8891 3.625Z"
        fill="white"
        fillOpacity="0.602"
      />
      <path d="M12.8891 3.625L7.03125 13.1719L12.8891 10.5547V3.625Z" fill="white" />
      <path
        d="M12.8891 17.6625V22.3711L18.75 14.2625L12.8891 17.6625Z"
        fill="white"
        fillOpacity="0.602"
      />
      <path d="M12.8891 22.3711V17.6617L7.03125 14.2625L12.8891 22.3711Z" fill="white" />
      <path
        d="M12.8891 16.5727L18.7461 13.1719L12.8891 10.5563V16.5727Z"
        fill="white"
        fillOpacity="0.2"
      />
      <path
        d="M7.03125 13.1719L12.8891 16.5727V10.5563L7.03125 13.1719Z"
        fill="white"
        fillOpacity="0.602"
      />
    </svg>
  );
}
