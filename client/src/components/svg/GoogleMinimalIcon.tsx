import { cn } from '~/utils';

export default function GoogleMinimalIcon({ className = '' }: { className?: string }) {
  return (
    <img
      src="../src/components/svgpath/image.svg" // Replace with the actual path to your .svg file
      alt="Google Icon"
      width="800"
      height="800"
      className={cn('h-4 w-4', className)}
    />
  );
}