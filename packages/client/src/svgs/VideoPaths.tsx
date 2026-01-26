export default function VideoPaths() {
  return (
    <>
      {/* Video container - rounded rectangle (not filled) */}
      <rect x="8" y="10" width="20" height="16" rx="3" stroke="white" strokeWidth="2" fill="none" />
      {/* Play button - centered and pointing right */}
      <path d="M22 18l-6 4v-8L22 18z" fill="white" />
    </>
  );
}
