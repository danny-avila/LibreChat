import * as React from 'react';
export interface SetStyleOptions {
    element?: HTMLElement;
}
/**
 * Easy to set element style, return previous style
 * IE browser compatible(IE browser doesn't merge overflow style, need to set it separately)
 * https://github.com/ant-design/ant-design/issues/19393
 *
 */
declare function setStyle(style: React.CSSProperties, options?: SetStyleOptions): React.CSSProperties;
export default setStyle;
