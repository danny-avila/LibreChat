var assert = require('assert');
var parse = require('./index');


assert.ok(!parse('inherit'));
assert.ok(!parse('bogus'));
assert.ok(!parse('10px {bogus}'));
assert.ok(!parse('10px inherit'));
assert.ok(parse.generics);

assert.deepEqual(parse('inherit', '10px serif'), {
  size: 10,
  family: ['serif']
});

assert.deepEqual(parse('10px serif'), {
  size: 10,
  family: ['serif']
});

assert.deepEqual(parse('bold 10px serif'), {
  weight: 'bold',
  size: 10,
  family: ['serif']
});

assert.deepEqual(parse('10px/20px serif'), {
  size: 10,
  lineHeight: 20,
  family: ['serif']
});

assert.deepEqual(parse('bolder 10px/20px serif'), {
  weight: 'bolder',
  size: 10,
  lineHeight: 20,
  family: ['serif']
});

assert.deepEqual(parse('normal 10px/20px serif'), {
  size: 10,
  lineHeight: 20,
  family: ['serif']
});

assert.deepEqual(parse('italic bolder 10px/20px serif'), {
  style: 'italic',
  weight: 'bolder',
  size: 10,
  lineHeight: 20,
  family: ['serif']
});

assert.deepEqual(parse('italic normal bolder 10px/20px serif'), {
  style: 'italic',
  weight: 'bolder',
  size: 10,
  lineHeight: 20,
  family: ['serif']
});

assert.deepEqual(parse('16px/1.2 Georgia,serif'), {
  size: 16,
  lineHeight: 19.2,
  family: ['Georgia', 'serif']
});

assert.deepEqual(parse('italic small-caps bolder 10px/20px serif'), {
  style: 'italic',
  variant: 'small-caps',
  weight: 'bolder',
  size: 10,
  lineHeight: 20,
  family: ['serif']
});

assert.deepEqual(parse('700 18px \'Raleway\', sans-serif'), {
  size: 18,
  weight: '700',
  family: ['\'Raleway\'', 'sans-serif']
});

// Generic font families
[
  'serif',
  'sans-serif',
  'cursive',
  'fantasy',
  'monospace'
].forEach(function(generic){
  assert.equal(parse('12px  ' + generic.toUpperCase()).family[0], generic);
});


// DPI/units
assert.equal(parse('10px serif').size, 10);
assert.equal(parse('10px serif', null, 200).size, 10);
assert.equal(parse('100mm serif', null, 25.4).size, 100);
assert.equal(parse('12pt serif', null, 96).size, 16);
assert.equal(parse('12pt serif', null, 192).size, 32);
assert.equal(parse('1in serif', null, 100).size, 100);
assert.equal(parse('1pc serif', null, 60).size, 10);


// em
assert.ok(!parse('1em serif', null, 192).size);
assert.equal(parse('1em serif', '12pt serif', 192).size, 32);
assert.equal(parse('.5em serif', '12pt serif', 192).size, 16);
assert.equal(parse('1em serif', '1in serif', 100).size, 100);
assert.equal(parse('.5em serif', '1in serif', 100).size, 50);


// require parent for percent
assert.ok(!parse('50% serif').size);
assert.equal(parse('50% serif', '100px serif').size, 50);
assert.equal(parse('50% sans-serif', '12pt serif', null, 96).size, 8);
assert.equal(parse('5000% sans-serif', '12pt serif', null, 96).size, 800);


// Serialization
var o = parse('italic 400 12px/2 Unknown Font, sans-serif');
assert.equal(o.toString(), 'italic 12px/24px "Unknown Font", sans-serif');
assert.equal(o.family.length, 2);
assert.equal(o.family[0], 'Unknown Font');
assert.equal(o.family[1], 'sans-serif');
assert.equal(parse('12px   SERIF').toString(), '12px serif');
