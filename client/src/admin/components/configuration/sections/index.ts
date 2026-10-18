/**
 * Section renderer registry.
 *
 * Map a top-level config section key to a custom React component.  The
 * component receives the same `FieldRendererProps` as the standard
 * `FieldRenderer`, so it always has full context (getValue, onChange,
 * configuredPaths, permissions, etc.).
 *
 * Any section NOT listed here falls back to the generic `FieldRenderer`.
 */

import type React from 'react';
import type * as t from '~/admin/types';
import { McpServersRenderer } from './McpServersRenderer';
import { CustomEndpointsRenderer } from './endpoints';
import { LangfuseRenderer } from './LangfuseRenderer';
import { ProvidersRenderer } from './providers';

export const SECTION_RENDERERS: Partial<Record<string, React.ComponentType<t.FieldRendererProps>>> =
  {
    endpoints: CustomEndpointsRenderer,
    endpointsProviders: ProvidersRenderer,
    mcpServers: McpServersRenderer,
    langfuse: LangfuseRenderer,
  };

/** Sections whose custom renderer handles its own accordion — they are rendered
 *  directly in ConfigTabContent without an outer MultiAccordion.Item wrapper. */
export const SELF_CONTAINED_SECTION_RENDERERS = new Set(['endpointsProviders']);
