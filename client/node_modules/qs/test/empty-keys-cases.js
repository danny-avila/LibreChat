'use strict';

module.exports = {
    emptyTestCases: [
        { input: '&', withEmptyKeys: {}, stringifyOutput: '', noEmptyKeys: {} },
        { input: '&&', withEmptyKeys: {}, stringifyOutput: '', noEmptyKeys: {} },
        { input: '&=', withEmptyKeys: { '': '' }, stringifyOutput: '=', noEmptyKeys: {} },
        { input: '&=&', withEmptyKeys: { '': '' }, stringifyOutput: '=', noEmptyKeys: {} },
        { input: '&=&=', withEmptyKeys: { '': ['', ''] }, stringifyOutput: '[0]=&[1]=', noEmptyKeys: {} },
        { input: '&=&=&', withEmptyKeys: { '': ['', ''] }, stringifyOutput: '[0]=&[1]=', noEmptyKeys: {} },

        { input: '=', withEmptyKeys: { '': '' }, noEmptyKeys: {}, stringifyOutput: '=' },
        { input: '=&', withEmptyKeys: { '': '' }, stringifyOutput: '=', noEmptyKeys: {} },
        { input: '=&&&', withEmptyKeys: { '': '' }, stringifyOutput: '=', noEmptyKeys: {} },
        { input: '=&=&=&', withEmptyKeys: { '': ['', '', ''] }, stringifyOutput: '[0]=&[1]=&[2]=', noEmptyKeys: {} },
        { input: '=&a[]=b&a[1]=c', withEmptyKeys: { '': '', a: ['b', 'c'] }, stringifyOutput: '=&a[0]=b&a[1]=c', noEmptyKeys: { a: ['b', 'c'] } },
        { input: '=a', withEmptyKeys: { '': 'a' }, noEmptyKeys: {}, stringifyOutput: '=a' },
        { input: '=a', withEmptyKeys: { '': 'a' }, noEmptyKeys: {}, stringifyOutput: '=a' },
        { input: 'a==a', withEmptyKeys: { a: '=a' }, noEmptyKeys: { a: '=a' }, stringifyOutput: 'a==a' },

        { input: '=&a[]=b', withEmptyKeys: { '': '', a: ['b'] }, stringifyOutput: '=&a[0]=b', noEmptyKeys: { a: ['b'] } },
        { input: '=&a[]=b&a[]=c&a[2]=d', withEmptyKeys: { '': '', a: ['b', 'c', 'd'] }, stringifyOutput: '=&a[0]=b&a[1]=c&a[2]=d', noEmptyKeys: { a: ['b', 'c', 'd'] } },
        { input: '=a&=b', withEmptyKeys: { '': ['a', 'b'] }, stringifyOutput: '[0]=a&[1]=b', noEmptyKeys: {} },
        { input: '=a&foo=b', withEmptyKeys: { '': 'a', foo: 'b' }, noEmptyKeys: { foo: 'b' }, stringifyOutput: '=a&foo=b' },

        { input: 'a[]=b&a=c&=', withEmptyKeys: { '': '', a: ['b', 'c'] }, stringifyOutput: '=&a[0]=b&a[1]=c', noEmptyKeys: { a: ['b', 'c'] } },
        { input: 'a[]=b&a=c&=', withEmptyKeys: { '': '', a: ['b', 'c'] }, stringifyOutput: '=&a[0]=b&a[1]=c', noEmptyKeys: { a: ['b', 'c'] } },
        { input: 'a[0]=b&a=c&=', withEmptyKeys: { '': '', a: ['b', 'c'] }, stringifyOutput: '=&a[0]=b&a[1]=c', noEmptyKeys: { a: ['b', 'c'] } },
        { input: 'a=b&a[]=c&=', withEmptyKeys: { '': '', a: ['b', 'c'] }, stringifyOutput: '=&a[0]=b&a[1]=c', noEmptyKeys: { a: ['b', 'c'] } },
        { input: 'a=b&a[0]=c&=', withEmptyKeys: { '': '', a: ['b', 'c'] }, stringifyOutput: '=&a[0]=b&a[1]=c', noEmptyKeys: { a: ['b', 'c'] } },

        { input: '[]=a&[]=b& []=1', withEmptyKeys: { '': ['a', 'b'], ' ': ['1'] }, stringifyOutput: '[0]=a&[1]=b& [0]=1', noEmptyKeys: { 0: 'a', 1: 'b', ' ': ['1'] } },
        { input: '[0]=a&[1]=b&a[0]=1&a[1]=2', withEmptyKeys: { '': ['a', 'b'], a: ['1', '2'] }, noEmptyKeys: { 0: 'a', 1: 'b', a: ['1', '2'] }, stringifyOutput: '[0]=a&[1]=b&a[0]=1&a[1]=2' },
        { input: '[deep]=a&[deep]=2', withEmptyKeys: { '': { deep: ['a', '2'] } }, stringifyOutput: '[deep][0]=a&[deep][1]=2', noEmptyKeys: { deep: ['a', '2'] } },
        { input: '%5B0%5D=a&%5B1%5D=b', withEmptyKeys: { '': ['a', 'b'] }, stringifyOutput: '[0]=a&[1]=b', noEmptyKeys: { 0: 'a', 1: 'b' } }
    ]
};
