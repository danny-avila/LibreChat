import React from 'react';
import TextChat from './components/TextChat';

const App = () => {

  return (
    <div className="flex h-screen">
      <div className="w-80 bg-slate-800"></div>
      <div className="flex h-full w-full flex-col bg-gray-50 ">
        <div className="flex-1 overflow-y-auto"></div>
        {/* <textarea className="m-10 h-16 p-4" onChange={(e) => console.log(e.target.value)}/> */}
        <TextChat />
      </div>
    </div>
  );
};

export default App;
