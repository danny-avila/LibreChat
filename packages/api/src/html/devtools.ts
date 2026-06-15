export const QUERY_DEVTOOLS_HEADER = 'x-librechat-enable-query-devtools';

const QUERY_DEVTOOLS_SENTINEL = 'data-librechat-query-devtools="true"';
const QUERY_DEVTOOLS_BOOTSTRAP = `<script ${QUERY_DEVTOOLS_SENTINEL}>window.__LIBRECHAT_CONFIG__=Object.assign({},window.__LIBRECHAT_CONFIG__,{"enableQueryDevtools":true});</script>`;

export interface QueryDevtoolsRequest {
  get(header: string): string | undefined;
}

export const shouldEnableQueryDevtools = (req: QueryDevtoolsRequest): boolean =>
  req.get(QUERY_DEVTOOLS_HEADER) === '1';

const injectQueryDevtoolsBootstrap = (html: string): string => {
  if (html.includes(QUERY_DEVTOOLS_SENTINEL)) {
    return html;
  }

  if (html.includes('</head>')) {
    return html.replace('</head>', `${QUERY_DEVTOOLS_BOOTSTRAP}</head>`);
  }

  return html.replace(/<body([^>]*)>/i, `<body$1>${QUERY_DEVTOOLS_BOOTSTRAP}`);
};

export const maybeInjectQueryDevtoolsBootstrap = (
  html: string,
  req: QueryDevtoolsRequest,
): string => {
  if (!shouldEnableQueryDevtools(req)) {
    return html;
  }

  return injectQueryDevtoolsBootstrap(html);
};
