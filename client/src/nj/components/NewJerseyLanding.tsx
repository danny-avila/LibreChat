/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import React from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDownIcon, ChevronUpIcon, GraduationCap, SquareArrowOutUpRight } from 'lucide-react';
import { useRecoilState } from 'recoil';
import { landingHelpOpen } from '~/nj/store/landing';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

/**
 * Provides alternate landing page content w/ New Jersey-specific information.
 */
export function NewJerseyLanding() {
  const [open, setOpen] = useRecoilState(landingHelpOpen);
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl pt-2">
      <h1 className="mb-3 text-center text-3xl font-medium">
        Welcome to the <span className="text-jersey-blue">NJ AI Assistant</span>
      </h1>

      <div className="mb-6">
        <p className="text-center">
          An internal generative artificial chatbot for use by NJ state employees and authorized
          parties built by the{' '}
          <a
            href="https://innovation.nj.gov/"
            className="underline hover:decoration-2"
            target="_blank"
            rel="noreferrer"
          >
            New Jersey Innovation Authority Platform Team
          </a>
          .
        </p>
      </div>

      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <div className="rounded border-2 border-border-light bg-surface-primary-alt">
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                key="content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                style={{ overflow: 'hidden' }}
              >
                <Collapsible.Content className="px-6 pt-6" forceMount>
                  <div className="mb-5 flex gap-3">
                    <p>
                      Check out these resources on how to use AI tools —{' '}
                      <span
                        role="button"
                        onClick={() => navigate('/nj/guide')}
                        className="inline-flex items-center gap-1 underline hover:decoration-2"
                      >
                        AI Assistant FAQ <GraduationCap size={16} />
                      </span>{' '}
                      and{' '}
                      <a
                        href="https://innovation.nj.gov/skills/ai-how-tos/"
                        className="inline-flex items-center gap-1 underline hover:decoration-2"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Generative AI How-to guides
                        <SquareArrowOutUpRight size={16} />
                      </a>
                    </p>
                  </div>

                  <div className="my-5 border-t-2 border-dotted border-border-medium" />

                  <div className="mb-5 flex gap-3">
                    <p>
                      Read the State{' '}
                      <a
                        href="https://innovation.nj.gov/ai-faq-state-employees/"
                        className="inline-flex items-center gap-1 underline hover:decoration-2"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Guidelines on Generative AI use for Public Professionals
                        <SquareArrowOutUpRight size={16} />
                      </a>
                    </p>
                  </div>

                  <div className="my-5 border-t-2 border-dotted border-border-medium" />

                  <div className="mb-2">
                    <p>
                      Access the state&apos;s Generative AI training as a{' '}
                      <a
                        href="https://stateofnewjersey.sabacloud.com/Saba/Web_spf/NA9P2PRD001/common/ledetail/CLIP.RAIPP.WBT/latestversion"
                        className="underline hover:decoration-2"
                        target="_blank"
                        rel="noreferrer"
                      >
                        State learner
                      </a>{' '}
                      (government employees) or{' '}
                      <a
                        href="https://stateofnewjersey-external.sabacloud.com/Saba/Web_spf/NA9P2PRD001/common/ledetail/CLIP.RAIPP.WBT/latestversion"
                        className="underline hover:decoration-2"
                        target="_blank"
                        rel="noreferrer"
                      >
                        External learner
                      </a>{' '}
                      (contractors and others) before using this tool.
                    </p>
                  </div>
                </Collapsible.Content>
              </motion.div>
            )}
          </AnimatePresence>

          <Collapsible.Trigger className="flex w-full items-center justify-between px-6 py-5">
            <span>
              {open
                ? "If you're all set, start a new conversation below."
                : 'Need help getting started?'}
            </span>
            <span className="flex items-center gap-1 font-semibold text-jersey-blue">
              {open ? (
                <>
                  <span>See less</span>
                  <ChevronUpIcon />
                </>
              ) : (
                <>
                  <span>See more</span>
                  <ChevronDownIcon />
                </>
              )}
            </span>
          </Collapsible.Trigger>
        </div>
      </Collapsible.Root>
    </div>
  );
}
