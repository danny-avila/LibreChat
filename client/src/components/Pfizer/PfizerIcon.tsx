export default function PfizerIcon({ className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="assets/pfizer-logo.png"
      alt="Pfizer Logo"
      className={`h-8 w-8 object-contain ${className}`}
    />
  );
};
