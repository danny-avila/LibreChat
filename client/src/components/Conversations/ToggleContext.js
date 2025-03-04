import { createContext, useContext } from 'react';
const defaultFunction = () => ({});
export const ToggleContext = createContext({
    setPopoverActive: defaultFunction,
    isPopoverActive: false,
});
export const useToggle = () => useContext(ToggleContext);
