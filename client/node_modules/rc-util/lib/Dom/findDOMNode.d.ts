import React from 'react';
export declare function isDOM(node: any): node is HTMLElement | SVGElement;
/**
 * Return if a node is a DOM node. Else will return by `findDOMNode`
 */
export default function findDOMNode<T = Element | Text>(node: React.ReactInstance | HTMLElement | SVGElement): T;
