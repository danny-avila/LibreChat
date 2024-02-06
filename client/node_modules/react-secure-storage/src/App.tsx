import React, { useEffect } from "react";
import secureLocalStorage from "./lib";
import logo from "./logo.svg";
import "./App.css";

function App() {
  useEffect(() => {
    console.log("secureLocalStorage", secureLocalStorage);
    secureLocalStorage.setItem("object", {
      message: "This is testing of local storage",
    });
    secureLocalStorage.setItem("number", 12);
    secureLocalStorage.setItem("string", "12");
    secureLocalStorage.setItem("boolean", true);
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <a className="App-link" href="https://reactjs.org" target="_blank" rel="noopener noreferrer">
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
