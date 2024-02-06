# remove-accents

Removes the accents from a string, converting them to their corresponding non-accented ASCII characters.

```
npm install remove-accents
```

[![Build Status](https://travis-ci.org/tyxla/remove-accents.svg)](https://travis-ci.org/tyxla/remove-accents)

## About

An easy to use solution for converting all accented characters to their corresponding non-accented ASCII characters.

## Syntax

``` js
removeAccents(inputString)
```

#### inputString

The string that you wish to remove accents from.

## Usage

Call `removeAccents()` by passing the string you wish to remove accents from, and you will get the non-accented string as result.

``` js
var input = 'ÀÁÂÃÄÅ';
var output = removeAccents(input);

console.log(output); // AAAAAA
```

## Methods

The exported function also has helper methods.

#### has

Determine if a string has any accented characters.

``` js
var accents = require('remove-accents');

console.log(accents.has('ÀÁÂÃÄÅ')); // true
console.log(accents.has('ABC'));    // false
```

#### remove

Alias of `removeAccents`.

``` js
var accents = require('remove-accents');

console.log(accents.remove('ÀÁÂÃÄÅ')); // AAAAAA
```

## License

MIT
