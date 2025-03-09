import { cn } from '~/utils';
export default function CustomMinimalIcon({
  size = 50,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/assets/llama_icon_kapo.PNG"
      width={size}
      height={size}
      className={cn(className)}
      alt="Custom Icon"
    />
  );
  // return (
  //   <svg
  //     xmlns="http://www.w3.org/2000/svg"
  //     width={size}
  //     height={size}
  //     viewBox="0 0 24 24"
  //     fill="none"
  //     stroke="currentColor"
  //     strokeWidth="2"
  //     strokeLinecap="round"
  //     strokeLinejoin="round"
  //     className={cn('lucide lucide-bot', className)}
  //   >
  //     <path d="M12 8V4H8" />
  //     <rect width="16" height="12" x="4" y="8" rx="2" />
  //     <path d="M2 14h2" />
  //     <path d="M20 14h2" />
  //     <path d="M15 13v2" />
  //     <path d="M9 13v2" />
  //   </svg>
  // );
}
