import { styleHookSingleton } from './hook';
/**
 * create a Component to add styles on demand
 * - styles are added when first instance is mounted
 * - styles are removed when the last instance is unmounted
 * - changing styles in runtime does nothing unless dynamic is set. But with multiple components that can lead to the undefined behavior
 */
export const styleSingleton = () => {
    const useStyle = styleHookSingleton();
    const Sheet = ({ styles, dynamic }) => {
        useStyle(styles, dynamic);
        return null;
    };
    return Sheet;
};
