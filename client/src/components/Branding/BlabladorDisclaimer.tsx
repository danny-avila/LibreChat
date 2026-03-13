import { BLABLADOR_DISCLAIMER } from '~/utils/blabladorBranding';

export default function BlabladorDisclaimer() {
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-10 w-[min(90vw,56rem)] -translate-x-1/2 px-4 text-center text-xs text-text-secondary sm:bottom-5">
      {BLABLADOR_DISCLAIMER}
    </div>
  );
}
