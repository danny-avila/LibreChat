import React from 'react';
function mirror(o) {
  return o;
}
export default function mapSelf(children) {
  // return ReactFragment
  return React.Children.map(children, mirror);
}