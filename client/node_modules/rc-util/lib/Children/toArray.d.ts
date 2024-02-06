import React from 'react';
export interface Option {
    keepEmpty?: boolean;
}
export default function toArray(children: React.ReactNode, option?: Option): React.ReactElement[];
