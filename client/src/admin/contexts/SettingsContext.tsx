import { createContext } from 'react';
import type * as t from '~/admin/types';

/**
 * Set by a single-field section so the row inside it renders without a second
 * label: the section heading is the visible label, and the control is named
 * "<Section> <field>" (VS-2). Settings sections reset it for their subtree.
 */
export const SoleFieldContext = createContext<t.SoleFieldContextValue | null>(null);

/** Heading level the next settings section renders (h2 at the top; each section adds one). */
export const HeadingLevelContext = createContext<t.SettingsHeadingLevel>(2);
