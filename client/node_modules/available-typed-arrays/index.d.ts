type AllPossibleTypedArrays = [
    'BigInt64Array',
    'BigUint64Array',
    'Float32Array',
    'Float64Array',
    'Int16Array',
    'Int32Array',
    'Int8Array',
    'Uint16Array',
    'Uint32Array',
    'Uint8Array',
    'Uint8ClampedArray',
];

declare function availableTypedArrays(): [] | AllPossibleTypedArrays | Omit<AllPossibleTypedArrays, 'BigInt64Array' | 'BigUint64Array'>;

export = availableTypedArrays;