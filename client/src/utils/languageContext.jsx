import React, { useState } from "react";

export const LanguageContext = React.createContext({});
export const LanguageContextProvider = ({ children }) => {
    const [lang, setLang] = useState('en');

    return (
        <LanguageContext.Provider value={{ lang, setLang }}>
            {children}
        </LanguageContext.Provider>
    );
};