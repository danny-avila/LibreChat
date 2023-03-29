import React from 'react';
import ModelItem from './ModelItem';

export default function MenuItems({ models, onSelect }) {
  return (
    <>
      {models.map(modelItem => (
        <ModelItem
          key={modelItem._id}
          value={modelItem.value}
          onSelect={onSelect}
          model={modelItem}
        />
      ))}
    </>
  );
}
