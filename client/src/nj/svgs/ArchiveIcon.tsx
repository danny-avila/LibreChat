export default function ArchiveIcon({ height = 24 }: { height?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      xmlSpace="preserve"
      aria-hidden="true"
    >
      <path
        d="M21 3H3C2.44772 3 2 3.44772 2 4V7C2 7.55228 2.44772 8 3 8H21C21.5523 8 22 7.55228 22 7V4C22 3.44772 21.5523 3 21 3Z"
        fill="black"
      />
      <path
        d="M4 8V19C4 19.5304 4.21071 20.0391 4.58579 20.4142C4.96086 20.7893 5.46957 21 6 21H18C18.5304 21 19.0391 20.7893 19.4142 20.4142C19.7893 20.0391 20 19.5304 20 19V8H4Z"
        fill="black"
      />
      <path d="M10 12H14" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
