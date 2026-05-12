/* eslint-disable i18next/no-literal-string */
import { Link } from 'react-router-dom';
import { useEffect } from 'react';

const SUGGESTIONS = [
  { label: 'New chat', path: '/c/new', href: '/c/new' },
  { label: 'Search', path: '/search', href: '/search' },
  { label: 'Sign in', path: '/login', href: '/login' },
];

export default function NotFound() {
  useEffect(() => {
    document.title = 'Page not found — CodeCan AI';
  }, []);

  return (
    <div className="nf-page min-h-screen bg-surface-primary text-text-primary">
      <style>{`
        .nf-head {
          font-family: "Cormorant Garamond", Georgia, serif;
          font-size: clamp(52px, 7vw, 88px);
          font-weight: 500;
          letter-spacing: -0.025em;
          line-height: 1.02;
          margin: 0;
        }
        .nf-head em { font-style: italic; color: var(--signal-amber); }
      `}</style>
      <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-16 sm:py-24">
        <div className="grid w-full grid-cols-1 items-center gap-12 md:grid-cols-[1.1fr_1fr] md:gap-16">
          {/* LEFT — copy + actions */}
          <div>
            <div className="mb-5 inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-[var(--slate-500)]">
              <span className="rounded-md bg-brand-blue-500/10 px-2.5 py-1 font-mono font-bold tracking-[0.06em] text-brand-blue-500 dark:bg-white/10 dark:text-[var(--dm-text)]">
                404
              </span>
              <span>Section not found</span>
            </div>

            <h1 className="nf-head mb-5 text-text-primary">
              That page
              <br />
              <em>isn&apos;t in the&nbsp;Code.</em>
            </h1>

            <p className="mb-8 max-w-xl text-base leading-relaxed text-text-secondary sm:text-lg">
              The link you followed doesn&apos;t match any section we have on file. Try jumping back
              to a known page, or start a new chat.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/c/new"
                className="inline-flex items-center justify-center rounded-xl bg-brand-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-blue-600 dark:bg-[var(--signal-amber)] dark:text-brand-blue-700 dark:hover:bg-[#F5C566]"
              >
                Start a new chat
              </Link>
              <Link
                to="/"
                className="inline-flex items-center justify-center rounded-xl border border-border-medium bg-surface-primary px-5 py-3 text-sm font-semibold text-text-primary transition hover:bg-surface-hover"
              >
                Back to home
              </Link>
            </div>

            {/* Suggested pages */}
            <div className="mt-14">
              <div className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-[var(--slate-500)]">
                Or try one of these
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {SUGGESTIONS.map((item) => (
                  <Link
                    key={item.path}
                    to={item.href}
                    className="group flex items-center gap-3 rounded-xl border border-border-light bg-surface-primary p-4 transition hover:-translate-y-[1px] hover:border-border-medium"
                  >
                    <span className="h-7 w-[3px] flex-none rounded-sm bg-[var(--signal-amber)]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold tracking-tight text-text-primary">
                        {item.label}
                      </div>
                      <div className="truncate font-mono text-[11px] text-[var(--slate-500)]">
                        {item.path}
                      </div>
                    </div>
                    <span className="ml-auto text-sm font-bold text-text-secondary opacity-70 transition group-hover:opacity-100">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — peeled page visual */}
          <div className="mx-auto aspect-square w-full max-w-[520px]">
            <svg
              viewBox="0 0 600 600"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              className="h-full w-full"
            >
              <defs>
                <pattern id="nfGrid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <path
                    d="M 32 0 L 0 0 0 32"
                    fill="none"
                    stroke="rgba(11,47,91,0.10)"
                    strokeWidth="1"
                  />
                </pattern>
                <linearGradient id="nfPaper" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#FFFFFF" />
                  <stop offset="1" stopColor="#F6F9FF" />
                </linearGradient>
                <filter id="nfShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="20" stdDeviation="20" floodColor="rgba(11,47,91,0.18)" />
                </filter>
              </defs>

              <rect width="600" height="600" fill="url(#nfGrid)" />

              <g filter="url(#nfShadow)">
                <rect x="180" y="160" width="320" height="360" rx="8" fill="#EAF2FF" />
                <rect x="166" y="146" width="320" height="360" rx="8" fill="#F6F9FF" />
                <path
                  d="M 152 132 H 460 A 8 8 0 0 1 468 140 V 446 L 384 480 L 152 480 Z"
                  fill="url(#nfPaper)"
                />
                <path d="M 468 446 L 384 480 L 468 480 Z" fill="#D9E3F2" />

                <g transform="translate(310 320)" textAnchor="middle">
                  <text
                    fontFamily="'Cormorant Garamond', Georgia, serif"
                    fontSize="170"
                    fontWeight="500"
                    fill="#0B2F5B"
                    letterSpacing="-6"
                  >
                    404
                  </text>
                </g>

                <g fill="#C4CDDC">
                  <rect x="184" y="380" width="240" height="6" rx="3" />
                  <rect x="184" y="396" width="200" height="6" rx="3" />
                  <rect x="184" y="412" width="160" height="6" rx="3" />
                </g>

                <rect x="160" y="156" width="6" height="300" rx="3" fill="#F2B644" />
              </g>

              <g transform="translate(420 100) rotate(-4)" filter="url(#nfShadow)">
                <rect x="0" y="0" width="160" height="56" rx="12" fill="#0B2F5B" />
                <text
                  x="80"
                  y="24"
                  textAnchor="middle"
                  fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
                  fontSize="10"
                  fontWeight="700"
                  letterSpacing="3"
                  fill="#F2B644"
                >
                  SECTION
                </text>
                <text
                  x="80"
                  y="42"
                  textAnchor="middle"
                  fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
                  fontSize="13"
                  fontWeight="700"
                  letterSpacing="2"
                  fill="#FFFFFF"
                >
                  NOT FOUND
                </text>
              </g>
            </svg>
          </div>
        </div>
      </main>
    </div>
  );
}
