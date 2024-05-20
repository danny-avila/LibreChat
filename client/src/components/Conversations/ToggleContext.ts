import { createContext, useContext } from 'react';

const defaultFunction: (value: boolean) => void = () => ({});
export const ToggleContext = createContext({
  setPopoverActive: defaultFunction,
});

export const useToggle = () => useContext(ToggleContext);
