export {gfmTaskListItemHtml} from './lib/html.js'
export {gfmTaskListItem} from './lib/syntax.js'

declare module 'micromark-util-types' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface TokenTypeMap {
    taskListCheck: 'taskListCheck'
    taskListCheckMarker: 'taskListCheckMarker'
    taskListCheckValueChecked: 'taskListCheckValueChecked'
    taskListCheckValueUnchecked: 'taskListCheckValueUnchecked'
  }
}
