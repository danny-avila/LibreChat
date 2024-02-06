export {mathHtml, type Options as HtmlOptions} from './lib/html.js'
export {math, type Options} from './lib/syntax.js'

declare module 'micromark-util-types' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface TokenTypeMap {
    mathFlow: 'mathFlow'
    mathFlowFence: 'mathFlowFence'
    mathFlowFenceMeta: 'mathFlowFenceMeta'
    mathFlowFenceSequence: 'mathFlowFenceSequence'
    mathFlowValue: 'mathFlowValue'
    mathText: 'mathText'
    mathTextData: 'mathTextData'
    mathTextPadding: 'mathTextPadding'
    mathTextSequence: 'mathTextSequence'
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface CompileData {
    mathFlowOpen?: boolean
  }
}
