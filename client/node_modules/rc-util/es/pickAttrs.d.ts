export interface PickConfig {
    aria?: boolean;
    data?: boolean;
    attr?: boolean;
}
/**
 * Picker props from exist props with filter
 * @param props Passed props
 * @param ariaOnly boolean | { aria?: boolean; data?: boolean; attr?: boolean; } filter config
 */
export default function pickAttrs(props: object, ariaOnly?: boolean | PickConfig): {};
