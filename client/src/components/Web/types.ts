import type { SearchRefType } from 'librechat-data-provider';
export type Citation = { turn: number; refType: SearchRefType | string; index: number };

export type CitationProps = {
  citationId?: string | null;
  citationType?: string;
  citations?: Array<Citation>;
  citation?: Citation;
};

export type CitationNode = {
  type?: string;
  value?: string;
  data?: {
    hName?: string;
    hProperties?: CitationProps;
  };
  children?: Array<CitationNode>;
};

export interface Sitelink {
  title: string;
  link: string;
}

export interface Reference {
  title: string;
  link: string;
  snippet: string;
  sitelinks?: Sitelink[];
  attribution: string;
}
