import AggregateBuild from '@kakang/mongodb-aggregate-builder'
import t from 'tap'
import { Controller } from '../../lib/controller/default'
import { build } from '../utils/factory'

t.test('compute', async function (t) {
  t.plan(24)

  const db = await build(t)
  const ctr = new Controller(db.collection('compute'), { logger: { level: 'silent' } })

  let query = ctr.computePipeline()
  t.same(query.toArray(), [{ $match: {} }])

  ctr.searchFields = ['id', 'foo', 'bar']
  ctr.autoRegExpSearch = false
  query = ctr.computePipeline({ search: 'baz' })
  t.same(query.toArray(), [{ $match: { $and: [{ $or: [{ id: 'baz' }, { foo: 'baz' }, { bar: 'baz' }] }] } }])

  ctr.searchFields = ['id']
  ctr.autoRegExpSearch = false
  query = ctr.computePipeline({ search: JSON.stringify({ $regex: 'baz', $options: 'i' }) })
  t.same(query.toArray(), [{ $match: { $and: [{ $or: [{ id: { $regex: 'baz', $options: 'i' } }] }] } }])

  ctr.searchFields = ['id']
  ctr.autoRegExpSearch = false
  query = ctr.computePipeline({ search: { $regex: 'baz', $options: 'i' } })
  t.same(query.toArray(), [{ $match: { $and: [{ $or: [{ id: { $regex: 'baz', $options: 'i' } }] }] } }])

  ctr.searchFields = []
  ctr.autoRegExpSearch = false
  query = ctr.computePipeline({ search: 'baz', filter: 'foo:baz,bar:baz' })
  t.same(query.toArray(), [{ $match: { $and: [{ foo: 'baz' }, { bar: 'baz' }] } }])

  ctr.searchFields = []
  ctr.autoRegExpSearch = false
  query = ctr.computePipeline({ search: 'baz', filter: `foo:${JSON.stringify({ $regex: 'baz', $option: 'i' })},bar:baz` })
  t.same(query.toArray(), [{ $match: { $and: [{ foo: { $regex: 'baz', $option: 'i' } }, { bar: 'baz' }] } }])

  ctr.searchFields = []
  ctr.autoRegExpSearch = false
  query = ctr.computePipeline({ search: 'baz', filter: 'foo:true,bar:1,baz:1.01' })
  t.same(query.toArray(), [{ $match: { $and: [{ foo: true }, { bar: 1 }, { baz: 1.01 }] } }])

  ctr.searchFields = ['id']
  ctr.autoRegExpSearch = true
  query = ctr.computePipeline({ search: 'baz' })
  t.same(query.toArray(), [{ $match: { $and: [{ $or: [{ id: { $regex: 'baz', $options: 'i' } }] }] } }])

  ctr.searchFields = ['id']
  ctr.autoRegExpSearch = true
  query = ctr.computePipeline({ search: JSON.stringify({ $regex: 'baz', $options: 'i' }) })
  t.same(query.toArray(), [{ $match: { $and: [{ $or: [{ id: { $regex: 'baz', $options: 'i' } }] }] } }])

  const start = new Date('2020-01-01T00:00:00.000Z')
  const end = new Date('2020-12-31T23:59:59.999Z')
  ctr.searchFields = []
  ctr.autoRegExpSearch = false
  query = ctr.computePipeline({ filter: 'createdAt:{"$gt":"2020-01-01T00:00:00.000Z","$lt":"2020-12-31T23:59:59.999Z"}' })
  t.same(query.toArray(), [{ $match: { $and: [{ createdAt: { $gt: start, $lt: end } }] } }])

  ctr.searchFields = []
  ctr.autoRegExpSearch = false
  query = ctr.computePipeline({ filter: '$expr:{"$gte":["$createdAt",{"$dateFromString":{"dateString":"2021-01-01T00:00:00.000Z"}}]}' })
  t.same(query.toArray(), [{ $match: { $and: [{ $expr: { $gte: ['$createdAt', { $dateFromString: { dateString: '2021-01-01T00:00:00.000Z' } }] } }] } }])

  ctr.searchFields = []
  ctr.autoRegExpSearch = false
  query = ctr.computePipeline({ filter: '$expr:{"$and":[{"$gte":["$createdAt",{"$dateFromString":{"dateString":"2021-01-01T00:00:00.000Z"}}]},{"$lte":["$createdAt",{"$dateFromString":{"dateString":"2021-01-01T00:00:00.000Z"}}]}]}' })
  t.same(query.toArray(), [{ $match: { $and: [{ $expr: { $and: [{ $gte: ['$createdAt', { $dateFromString: { dateString: '2021-01-01T00:00:00.000Z' } }] }, { $lte: ['$createdAt', { $dateFromString: { dateString: '2021-01-01T00:00:00.000Z' } }] }] } }] } }])

  ctr.searchFields = ['id']
  ctr.autoRegExpSearch = true
  // @ts-expect-error
  query = ctr.computePipeline({ search: null })
  t.same(query.toArray(), [{ $match: {} }])

  ctr.searchFields = ['id']
  ctr.autoRegExpSearch = true
  query = ctr.computePipeline({ search: { $regex: '999', $options: 'i' } })
  t.same(query.toArray(), [{ $match: { $and: [{ $or: [{ id: { $regex: '999', $options: 'i' } }] }] } }])

  ctr.searchFields = []
  ctr.autoRegExpSearch = false
  query = ctr.computePipeline({ filter: `foo:${JSON.stringify({ $exists: false })}` })
  t.same(query.toArray(), [{ $match: { $and: [{ foo: { $exists: false } }] } }])

  let sort = ctr.computeSort()
  t.same(sort, false)

  sort = ctr.computeSort('+foo,') as AggregateBuild
  t.same(sort.toArray(), [{ $sort: { foo: 1 } }])

  sort = ctr.computeSort('foo,') as AggregateBuild
  t.same(sort.toArray(), [{ $sort: { foo: 1 } }])

  sort = ctr.computeSort('-foo,bar') as AggregateBuild
  t.same(sort.toArray(), [{ $sort: { foo: -1, bar: 1 } }])

  sort = ctr.computeSort('+foo,-bar') as AggregateBuild
  t.same(sort.toArray(), [{ $sort: { foo: 1, bar: -1 } }])

  // leading space due to plus is represent space in querystring
  sort = ctr.computeSort(' foo,-bar') as AggregateBuild
  t.same(sort.toArray(), [{ $sort: { foo: 1, bar: -1 } }])

  let option = ctr.computeOption()
  t.same(option, false)

  option = ctr.computeOption(10, 10) as AggregateBuild
  t.same(option.toArray(), [{ $limit: 100 }, { $skip: 90 }])

  option = ctr.computeOption(0, 10) as AggregateBuild
  t.same(option.toArray(), [{ $limit: 10 }, { $skip: 0 }])
})
