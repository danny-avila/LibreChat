import React, { useState } from 'react';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/Tabs";
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs.tsx';
import { useSelector } from 'react-redux';
// import RowButton from './RowButton';

export default function BingStyles() {
  const [value, setValue] = useState('fast');
  const { model } = useSelector((state) => state.submit);

  const show = model === 'bingai' || model === 'sydney';
  const defaultClasses = 'p-2 rounded-md font-normal bg-white/[.60] text-black';
  const defaultSelected = defaultClasses + 'font-medium data-[state=active]:text-white';

  const selectedClass = (val) => val + '-tab ' + defaultSelected;

  const changeHandler = value => {
    setValue(value);
  };
  return (
    // <div className='styles-container w-full'>
    <Tabs
      defaultValue={value}
      className={`shadow-md mb-1 bing-styles ${show ? 'show' : ''}`}
      onValueChange={changeHandler}
    >
      <TabsList className="bg-white/[.60] ">
        <TabsTrigger
          value="creative"
          className={`${value === 'creative' ? selectedClass(value) : defaultClasses}`}
        >
          {/* <RowButton text="creative" /> */}
          {'Creative'}
        </TabsTrigger>
        <TabsTrigger
          value="fast"
          className={`${value === 'fast' ? selectedClass(value) : defaultClasses}`}
        >
          {'Balanced'}
        </TabsTrigger>
        <TabsTrigger
          value="precise"
          className={`${value === 'precise' ? selectedClass(value) : defaultClasses}`}
        >
          {'Precise'}
        </TabsTrigger>
      </TabsList>
    </Tabs>
    // </div>
  );
}
