export default function CancelledIcon() {
  return (
    <div
      className="absolute left-0 top-0 flex h-full w-full items-center justify-center rounded-full bg-gray-300 text-white"
      style={{ opacity: 1, transform: 'none' }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 9" fill="none" width="8" height="9">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M7.32256 1.48447C7.59011 1.16827 7.55068 0.695034 7.23447 0.427476C6.91827 0.159918 6.44503 0.199354 6.17748 0.515559L4.00002 3.08892L1.82256 0.515559C1.555 0.199354 1.08176 0.159918 0.765559 0.427476C0.449355 0.695034 0.409918 1.16827 0.677476 1.48447L3.01755 4.25002L0.677476 7.01556C0.409918 7.33176 0.449354 7.805 0.765559 8.07256C1.08176 8.34011 1.555 8.30068 1.82256 7.98447L4.00002 5.41111L6.17748 7.98447C6.44503 8.30068 6.91827 8.34011 7.23447 8.07256C7.55068 7.805 7.59011 7.33176 7.32256 7.01556L4.98248 4.25002L7.32256 1.48447Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}
