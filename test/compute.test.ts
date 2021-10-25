import AggregateBuild from '@kakang/mongodb-aggregate-builder'
import t from 'tap'
import Controller from '../lib'
import { build } from './utils/factory'

t.plan(1)
t.test('constructor', async function (t) {
  t.plan(26)

  const db = await build(t)
  const ctr = new Controller(db.collection('compute'))

  t.test('computeQuery - empty', function (t) {
    t.plan(1)
    const query = ctr.computeQuery()
    t.same(query.toArray(), [{ $match: {} }])
  })

  t.test('computeQuery - search with string', function (t) {
    t.plan(1)
    ctr.searchFields = ['id', 'foo', 'bar']
    const query = ctr.computeQuery('baz')
    t.same(query.toArray(), [{ $match: { $and: [{ $or: [{ id: 'baz' }, { foo: 'baz' }, { bar: 'baz' }] }] } }])
  })

  t.test('computeQuery - search with stringify json', function (t) {
    t.plan(1)
    ctr.searchFields = ['id']
    const query = ctr.computeQuery(JSON.stringify({ $regex: 'baz', $options: 'i' }))
    t.same(query.toArray(), [{ $match: { $and: [{ $or: [{ id: { $regex: 'baz', $options: 'i' } }] }] } }])
  })

  t.test('computeQuery - search with json', function (t) {
    t.plan(1)
    ctr.searchFields = ['id']
    const query = ctr.computeQuery({ $regex: 'baz', $options: 'i' })
    t.same(query.toArray(), [{ $match: { $and: [{ $or: [{ id: { $regex: 'baz', $options: 'i' } }] }] } }])
  })

  t.test('computeQuery - invalid $function', function (t) {
    t.plan(1)
    try {
      ctr.computeQuery({ $function: { body: '', lang: 'js' } })
      t.fail()
    } catch (err) {
      t.ok(err)
    }
  })

  t.test('computeQuery - invalid $accumulator', function (t) {
    t.plan(1)
    try {
      ctr.computeQuery({ $accumulator: { accumulate: '', lang: 'js' } })
      t.fail()
    } catch (err) {
      t.ok(err)
    }
  })

  t.test('computeQuery - filter with string', function (t) {
    t.plan(1)
    ctr.searchFields = []
    const query = ctr.computeQuery('baz', 'foo:baz,bar:baz')
    t.same(query.toArray(), [{ $match: { $and: [{ foo: 'baz' }, { bar: 'baz' }] } }])
  })

  t.test('computeQuery - filter with json', function (t) {
    t.plan(1)
    ctr.searchFields = []
    const query = ctr.computeQuery('baz', `foo:${JSON.stringify({ $regex: 'baz', $option: 'i' })},bar:baz`)
    t.same(query.toArray(), [{ $match: { $and: [{ foo: { $regex: 'baz', $option: 'i' } }, { bar: 'baz' }] } }])
  })

  t.test('computeQuery - filter with number', function (t) {
    t.plan(1)
    ctr.searchFields = []
    const query = ctr.computeQuery('baz', 'foo:true,bar:1,baz:1.01')
    t.same(query.toArray(), [{ $match: { $and: [{ foo: true }, { bar: 1 }, { baz: 1.01 }] } }])
  })

  t.test('computeQuery - search with auto regexp', function (t) {
    t.plan(1)
    ctr.searchFields = ['id']
    ctr.autoRegExpSearch = true
    const query = ctr.computeQuery('baz')
    t.same(query.toArray(), [{ $match: { $and: [{ $or: [{ id: { $regex: 'baz', $options: 'i' } }] }] } }])
  })

  t.test('computeQuery - search with stringify json and auto regexp', function (t) {
    t.plan(1)
    ctr.searchFields = ['id']
    ctr.autoRegExpSearch = true
    const query = ctr.computeQuery(JSON.stringify({ $regex: 'baz', $options: 'i' }))
    t.same(query.toArray(), [{ $match: { $and: [{ $or: [{ id: { $regex: 'baz', $options: 'i' } }] }] } }])
  })

  t.test('computeQuery - filter with date', function (t) {
    t.plan(1)
    ctr.searchFields = []
    const start = new Date('2020-01-01T00:00:00.000Z')
    const end = new Date('2020-12-31T23:59:59.999Z')
    const query = ctr.computeQuery('', 'createdAt:{"$gt":"2020-01-01T00:00:00.000Z","$lt":"2020-12-31T23:59:59.999Z"}')
    t.same(query.toArray(), [{ $match: { $and: [{ createdAt: { $gt: start, $lt: end } }] } }])
  })

  t.test('computeQuery - filter with $expr', function (t) {
    t.plan(1)
    ctr.searchFields = []
    const query = ctr.computeQuery('', '$expr:{"$gte":["$createdAt",{"$dateFromString":{"dateString":"2021-01-01T00:00:00.000Z"}}]}')
    t.same(query.toArray(), [{ $match: { $and: [{ $expr: { $gte: ['$createdAt', { $dateFromString: { dateString: '2021-01-01T00:00:00.000Z' } }] } }] } }])
  })

  t.test('computeQuery - filter with $expr and $and', function (t) {
    t.plan(1)
    ctr.searchFields = []
    const query = ctr.computeQuery('', '$expr:{"$and":[{"$gte":["$createdAt",{"$dateFromString":{"dateString":"2021-01-01T00:00:00.000Z"}}]},{"$lte":["$createdAt",{"$dateFromString":{"dateString":"2021-01-01T00:00:00.000Z"}}]}]}')
    t.same(query.toArray(), [{ $match: { $and: [{ $expr: { $and: [{ $gte: ['$createdAt', { $dateFromString: { dateString: '2021-01-01T00:00:00.000Z' } }] }, { $lte: ['$createdAt', { $dateFromString: { dateString: '2021-01-01T00:00:00.000Z' } }] }] } }] } }])
  })

  t.test('computeQuery - filter with null', function (t) {
    t.plan(1)
    ctr.searchFields = ['id']
    ctr.autoRegExpSearch = true
    const query = ctr.computeQuery(null)
    t.same(query.toArray(), [{ $match: {} }])
  })

  t.test('computeQuery - ensure $regex to string', function (t) {
    t.plan(1)
    ctr.searchFields = ['id']
    ctr.autoRegExpSearch = true
    const query = ctr.computeQuery({ $regex: '999', $options: 'i' })
    t.same(query.toArray(), [{ $match: { $and: [{ $or: [{ id: { $regex: '999', $options: 'i' } }] }] } }])
  })

  t.test('computeQuery - filter boolean', function (t) {
    t.plan(1)
    ctr.searchFields = []
    const query = ctr.computeQuery('', `foo:${JSON.stringify({ $exists: false })}`)
    t.same(query.toArray(), [{ $match: { $and: [{ foo: { $exists: false } }] } }])
  })

  t.test('computeSort', function (t) {
    t.plan(1)
    const sort = ctr.computeSort()
    t.same(sort, false)
  })

  t.test('computeSort', function (t) {
    t.plan(2)
    const sort = ctr.computeSort('+foo,')
    t.ok(sort)
    const builder = sort as AggregateBuild
    t.same(builder.toArray(), [{ $sort: { foo: 1 } }])
  })

  t.test('computeSort', function (t) {
    t.plan(2)
    const sort = ctr.computeSort('foo,')
    t.ok(sort)
    const builder = sort as AggregateBuild
    t.same(builder.toArray(), [{ $sort: { foo: 1 } }])
  })

  t.test('computeSort', function (t) {
    t.plan(2)
    const sort = ctr.computeSort('-foo,bar')
    t.ok(sort)
    const builder = sort as AggregateBuild
    t.same(builder.toArray(), [{ $sort: { foo: -1, bar: 1 } }])
  })

  t.test('computeSort', function (t) {
    t.plan(2)
    const sort = ctr.computeSort('+foo,-bar')
    t.ok(sort)
    const builder = sort as AggregateBuild
    t.same(builder.toArray(), [{ $sort: { foo: 1, bar: -1 } }])
  })

  t.test('computeSort', function (t) {
    t.plan(2)
    // leading space due to plus is represent space in querystring
    const sort = ctr.computeSort(' foo,-bar')
    t.ok(sort)
    const builder = sort as AggregateBuild
    t.same(builder.toArray(), [{ $sort: { foo: 1, bar: -1 } }])
  })

  t.test('computeOption', function (t) {
    t.plan(1)
    const option = ctr.computeOption()
    t.same(option, false)
  })

  t.test('computeOption', function (t) {
    t.plan(2)
    const option = ctr.computeOption(10, 10)
    t.ok(option)
    const builder = option as AggregateBuild
    t.same(builder.toArray(), [{ $limit: 100 }, { $skip: 90 }])
  })

  t.test('computeOption', function (t) {
    t.plan(2)
    const option = ctr.computeOption(0, 10)
    t.ok(option)
    const builder = option as AggregateBuild
    t.same(builder.toArray(), [{ $limit: 10 }, { $skip: 0 }])
  })
})
