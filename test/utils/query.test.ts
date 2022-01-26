import t from 'tap'
import { findNextPair, isUpdateQuery, mergeUpdateQueryData, normalize } from '../../lib/utils/query'

t.test('should be update query', function (t) {
  const keys = ['$currentDate', '$inc', '$min', '$max', '$mul', '$rename', '$set', '$setOnInsert', '$unset', '$addToSet', '$pop', '$pull', '$push', '$pushAll', '$bit']
  t.plan(keys.length)

  for (const key of keys) {
    t.equal(isUpdateQuery({ [key]: 1 }), true, `${key} should be update query`)
  }
})

t.test('should not be update query', function (t) {
  t.plan(1)
  t.equal(isUpdateQuery({ foo: 'bar' }), false)
})

t.test('should merge update query', function (t) {
  const cases = [
    { from: {}, to: {}, output: { $set: {} } },
    { from: { $set: { foo: 'bar' } }, to: { bar: 'baz' }, output: { $set: { foo: 'bar', bar: 'baz' } } },
    { from: { bar: 'baz' }, to: { $set: { foo: 'bar' } }, output: { $set: { foo: 'bar', bar: 'baz' } } }
  ]
  t.plan(cases.length)

  for (const kase of cases) {
    t.same(mergeUpdateQueryData(kase.from, kase.to), kase.output)
  }
})

t.test('empty string findNextPair', function (t) {
  t.plan(4)
  const { startIndex, endIndex, key, value } = findNextPair('')
  t.equal(startIndex, 0)
  t.equal(endIndex, 0)
  t.equal(key, '')
  t.equal(value, '')
})

t.test('invalid key string findNextPair', function (t) {
  t.plan(4)
  const { startIndex, endIndex, key, value } = findNextPair('[]')
  t.equal(startIndex, 0)
  t.equal(endIndex, 0)
  t.equal(key, '')
  t.equal(value, '')
})

t.test('no value pairs findNextPair', function (t) {
  t.plan(4)
  const { startIndex, endIndex, key, value } = findNextPair('foo')
  t.equal(startIndex, 0)
  t.equal(endIndex, 0)
  t.equal(key, 'foo')
  t.equal(value, '')
})

t.test('no delimiter pairs findNextPair', function (t) {
  t.plan(4)
  const { startIndex, endIndex, key, value } = findNextPair('foo:bar')
  t.equal(startIndex, 0)
  t.equal(endIndex, 0)
  t.equal(key, 'foo')
  t.equal(value, 'bar')
})

t.test('normal pairs findNextPair', function (t) {
  t.plan(4)
  const { startIndex, endIndex, key, value } = findNextPair('foo:bar,hello:world,')
  t.equal(startIndex, 0)
  t.equal(endIndex, 8)
  t.equal(key, 'foo')
  t.equal(value, 'bar')
})

t.test('json pairs findNextPair', function (t) {
  t.plan(4)
  const { startIndex, endIndex, key, value } = findNextPair('foo:{"foo":["123","456"],"bar":{"hello":"world}},')
  t.equal(startIndex, 0)
  t.equal(endIndex, 49)
  t.equal(key, 'foo')
  t.equal(value, '{"foo":["123","456"],"bar":{"hello":"world}}')
})

const cases: Array<{
  input: any
  output: any
  validator: 'equal' | 'same' | 'error'
  error?: boolean
  instanceOf?: boolean
}> = [
  // secure guard
  { input: '$function', output: 'invalid operator found', validator: 'equal', error: true },
  { input: '$accumulator', output: 'invalid operator found', validator: 'equal', error: true },
  { input: { $function: {} }, output: 'invalid operator found', validator: 'equal', error: true },
  { input: { $accumulator: {} }, output: 'invalid operator found', validator: 'equal', error: true },
  // true
  { input: 'true', output: true, validator: 'equal', error: false },
  { input: 'TrUe', output: true, validator: 'equal', error: false },
  { input: true, output: true, validator: 'equal', error: false },
  // false
  { input: 'false', output: false, validator: 'equal', error: false },
  { input: 'FaLsE', output: false, validator: 'equal', error: false },
  { input: false, output: false, validator: 'equal', error: false },
  // number
  { input: 123456, output: 123456, validator: 'equal', error: false },
  { input: '123456', output: 123456, validator: 'equal', error: false },
  // IOS8601
  { input: '1970-01-01T00:00:00.000Z', output: Date, validator: 'equal', error: false, instanceOf: true },
  // Array
  { input: ['true', '123', 'string'], output: [true, 123, 'string'], validator: 'same', error: false },
  // JSON
  { input: { foo: 'bar' }, output: { foo: 'bar' }, validator: 'same', error: false },
  { input: { foo: '123' }, output: { foo: 123 }, validator: 'same', error: false },
  { input: { foo: 'true' }, output: { foo: true }, validator: 'same', error: false },
  // Nested
  { input: { foo: ['true', '123', 'string'] }, output: { foo: [true, 123, 'string'] }, validator: 'same', error: false },
  // stringify
  { input: '{"foo":["true","123","string"]}', output: { foo: [true, 123, 'string'] }, validator: 'same', error: false },
  // Special Case
  { input: { $dateFromString: { dateString: '1970-01-01T00:00:00.000Z' } }, output: { $dateFromString: { dateString: '1970-01-01T00:00:00.000Z' } }, validator: 'same' },
  { input: '{"$dateFromString":{"dateString":"1970-01-01T00:00:00.000Z"}}', output: { $dateFromString: { dateString: '1970-01-01T00:00:00.000Z' } }, validator: 'same' },
  { input: { $expr: { $regex: 'foo' } }, output: { $expr: { $regex: 'foo' } }, validator: 'same' },
  { input: '{"$expr":{"$regex":"foo"}}', output: { $expr: { $regex: 'foo' } }, validator: 'same' }
]

t.test('normalize', function (t) {
  t.plan(cases.length)

  for (let i = 0; i < cases.length; i++) {
    const kase = cases[i]
    if (kase.error === true) {
      try {
        normalize(kase.input)
      } catch (err: any) {
        t[kase.validator](err.message, kase.output)
      }
    } else if (kase.instanceOf === true) {
      t[kase.validator](normalize(kase.input) instanceof kase.output, true)
    } else {
      t[kase.validator](normalize(kase.input), kase.output)
    }
  }
})
