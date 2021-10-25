import t from 'tap'
import { isUpdateQuery, mergeUpdateQueryData, retrieveUpdateQueryData } from '../lib'

t.plan(3)
t.test('isUpdateQuery', function (t) {
  const plan = ['$currentDate', '$inc', '$min', '$max', '$mul', '$rename', '$set', '$setOnInsert', '$unset', '$addToSet', '$pop', '$pull', '$push', '$pushAll', '$bit']
  t.plan(1 + plan.length)

  for (let i = 0; i < plan.length; i++) {
    t.test(plan[i], function (t) {
      t.plan(1)
      t.equal(isUpdateQuery({ [plan[i]]: {} }), true)
    })
  }

  t.test('document', function (t) {
    t.plan(1)
    t.same(isUpdateQuery({ foo: 'bar' }), false)
  })
})

t.test('retrieveUpdateQueryData', function (t) {
  t.plan(4)
  t.test('have $set', function (t) {
    t.plan(1)
    const result = retrieveUpdateQueryData({ $set: { foo: 'bar' } })
    t.same(result, { foo: 'bar' })
  })

  t.test('empty $set', function (t) {
    t.plan(1)
    const result = retrieveUpdateQueryData({ $set: undefined })
    t.same(result, {})
  })

  t.test('update query with no $set', function (t) {
    t.plan(1)
    const result = retrieveUpdateQueryData({ $pull: { foo: 'bar' } })
    t.same(result, {})
  })

  t.test('document', function (t) {
    t.plan(1)
    const result = retrieveUpdateQueryData({ foo: 'bar' })
    t.same(result, { foo: 'bar' })
  })
})

t.test('mergeUpdateQueryData', function (t) {
  t.plan(5)
  const from = { foo: 'bar', bar: 'baz' }
  const to = { foo: 'hello', hello: 'world' }
  const res = { foo: 'hello', bar: 'baz', hello: 'world' }

  t.test('document + document', function (t) {
    t.plan(1)
    const result = mergeUpdateQueryData<any>(from, to)
    t.same(result, { $set: res })
  })

  t.test('$set + document', function (t) {
    t.plan(1)
    const result = mergeUpdateQueryData<any>({ $set: from }, to)
    t.same(result, { $set: res })
  })

  t.test('document + $set', function (t) {
    t.plan(1)
    const result = mergeUpdateQueryData<any>(from, { $set: to })
    t.same(result, { $set: res })
  })

  t.test('$set + $set', function (t) {
    t.plan(1)
    const result = mergeUpdateQueryData<any>({ $set: from }, { $set: to })
    t.same(result, { $set: res })
  })

  t.test('$pull + document', function (t) {
    t.plan(1)
    const result = mergeUpdateQueryData<any>({ $pull: from }, to)
    t.same(result, { $pull: from, $set: to })
  })
})
