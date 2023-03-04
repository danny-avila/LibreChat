import React from 'react';
// import { setModel, setDisabled } from '~/store/submitSlice';
// import { swr } from '~/utils/fetchers';
// import { setModels } from '~/store/modelSlice';
import ModelItem from './ModelItem';

export default function MenuItems({ models }) {
  return (
    <>
      {models.map((modelItem, i) => (
        <ModelItem
          key={i}
          // id={modelItem._id}
          modelName={modelItem.name}
          value={modelItem.value}
        />
      ))}
    </>
  );
}
