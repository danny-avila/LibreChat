export {gfmFootnote} from './lib/syntax.js'
export {
  gfmFootnoteHtml,
  defaultBackLabel,
  type BackLabelTemplate,
  type Options as HtmlOptions
} from './lib/html.js'

declare module 'micromark-util-types' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface TokenTypeMap {
    gfmFootnoteCall: 'gfmFootnoteCall'
    gfmFootnoteCallLabelMarker: 'gfmFootnoteCallLabelMarker'
    gfmFootnoteCallMarker: 'gfmFootnoteCallMarker'
    gfmFootnoteCallString: 'gfmFootnoteCallString'
    gfmFootnoteDefinition: 'gfmFootnoteDefinition'
    gfmFootnoteDefinitionIndent: 'gfmFootnoteDefinitionIndent'
    gfmFootnoteDefinitionLabel: 'gfmFootnoteDefinitionLabel'
    gfmFootnoteDefinitionLabelMarker: 'gfmFootnoteDefinitionLabelMarker'
    gfmFootnoteDefinitionLabelString: 'gfmFootnoteDefinitionLabelString'
    gfmFootnoteDefinitionMarker: 'gfmFootnoteDefinitionMarker'
    gfmFootnoteDefinitionWhitespace: 'gfmFootnoteDefinitionWhitespace'
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface CompileData {
    gfmFootnoteDefinitions?: Record<string, string>
    gfmFootnoteDefinitionStack?: string[]
    gfmFootnoteCallCounts?: Record<string, number>
    gfmFootnoteCallOrder?: string[]
  }
}
