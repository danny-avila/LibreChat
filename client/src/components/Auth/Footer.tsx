import { TStartupConfig } from 'librechat-data-provider';

const DATENSCHUTZ_URL = 'https://karrieremum.at/datenschutz';
const IMPRESSUM_URL = 'https://karrieremum.at/impressum';

function Footer({ startupConfig: _startupConfig }: { startupConfig: TStartupConfig | null | undefined }) {
  return (
    <div className="m-4 flex justify-center gap-4" role="contentinfo">
      <a
        className="text-sm underline decoration-transparent transition-all duration-200"
        style={{ color: '#c9a87c' }}
        href={DATENSCHUTZ_URL}
        target="_blank"
        rel="noreferrer"
      >
        Datenschutzerklärung
      </a>
      <div className="border-r-[1px] border-gray-600" />
      <a
        className="text-sm underline decoration-transparent transition-all duration-200"
        style={{ color: '#c9a87c' }}
        href={IMPRESSUM_URL}
        target="_blank"
        rel="noreferrer"
      >
        Impressum
      </a>
    </div>
  );
}

export default Footer;
