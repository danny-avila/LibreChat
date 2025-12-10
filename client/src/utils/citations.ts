/** Matches both literal text \ue203...\ue204 and actual Unicode characters */
export const SPAN_REGEX = /((?:\\ue203|\ue203).*?(?:\\ue204|\ue204))/g;
export const COMPOSITE_REGEX = /((?:\\ue200|\ue200).*?(?:\\ue201|\ue201))/g;
export const STANDALONE_PATTERN =
  /(?:\\ue202|\ue202)turn(\d+)(search|image|news|video|ref|file)(\d+)/g;
export const CLEANUP_REGEX =
  /\\ue200|\\ue201|\\ue202|\\ue203|\\ue204|\\ue206|\ue200|\ue201|\ue202|\ue203|\ue204|\ue206/g;
export const INVALID_CITATION_REGEX =
  /\s*(?:\\ue202|\ue202)turn\d+(search|news|image|video|ref|file)\d+/g;
