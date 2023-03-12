import React from 'react';
import ModelItem from './ModelItem';

export default function MenuItems({ models, onSelect }) {
  return (
    <>
      {models.map((modelItem) => (
        <ModelItem
          key={modelItem._id}
          id={modelItem._id}
          modelName={modelItem.name}
          value={modelItem.value}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
