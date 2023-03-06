import React from 'react';
import ModelItem from './ModelItem';

export default function MenuItems({ models }) {
  return (
    <>
      {models.map((modelItem, i) => (
        <ModelItem
          key={i}
          modelName={modelItem.name}
          value={modelItem.value}
        />
      ))}
    </>
  );
}
