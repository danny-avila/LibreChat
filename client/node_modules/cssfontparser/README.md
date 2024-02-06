# ccsfontparser

parse shorthand css font declarations into an object

# install

`npm install cssfontparser`

# use

```javascript

var parse = require('cssfontparser');
var obj = parse('italic small-caps bolder 50%/20px serif', '1in san-serif', 400);
console.log(obj);

/* outputs:

{ style: 'italic',
  variant: 'small-caps',
  weight: 'bolder',
  size: 200,
  lineHeight: 20,
  family: 'serif' }

*/

console.log(obj.toString());

/* outputs:
  'italic small-caps bolder 200px/20px serif'
*/
```


#signature


`cssfontparser`(`"font string"`[,`"parent font string"`[, `dpi` = `96.0`]]);

_note_: a `parent font string` is required for `em` and `%` size calculations.

# license