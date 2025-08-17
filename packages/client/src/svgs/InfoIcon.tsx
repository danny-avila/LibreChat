import { cn } from '~/utils';

/**
 * InfoIcon Component
 * 
 * Renders an information icon (ⓘ) used to display model metadata in chat responses.
 * The icon consists of a circle border with a lowercase "i" inside (dot and stem).
 * 
 * @component
 * @param {Object} props - Component props
 * @param {string} [props.className=''] - Additional CSS classes to apply to the SVG element
 * @param {string} [props.size='1em'] - Size of the icon (width and height)
 * 
 * @example
 * // Basic usage
 * <InfoIcon />
 * 
 * @example
 * // With custom size and class
 * <InfoIcon size="24" className="text-blue-500" />
 * 
 * @returns {JSX.Element} SVG information icon
 */
export default function InfoIcon({ className = '', size = '1em' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height={size}
      width={size}
      fill="none"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('icon-md-heavy', className)}
    >
      {/* Outer circle border */}
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
      {/* Dot of the "i" */}
      <circle cx="12" cy="8" r="0.75" fill="currentColor" />
      {/* Stem of the "i" */}
      <path d="M12 11v5" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}
