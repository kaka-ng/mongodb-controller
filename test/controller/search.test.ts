import t from 'tap'
import { Controller } from '../../lib/controller/default'
import { build } from '../utils/factory'

t.test('search', async function (t) {
  t.plan(4 * 4 + 2)
  const db = await build(t)
  const collection = db.collection('search')

  const ctr = new Controller(collection, { logger: { level: 'silent' }, searchFields: ['foo'] })
  await ctr.insertMany([{ foo: 'bar' }, { foo: 'baz' }, { foo: 'foo' }])

  let result = await ctr.search({ search: 'bar' })
  t.equal(result.length, 1)
  for (let i = 0; i < result.length; i++) {
    t.equal('id' in result[i], true)
    t.equal('foo' in result[i], true)
    t.equal('createdAt' in result[i], true)
    t.equal('updatedAt' in result[i], true)
  }

  result = await ctr.search({ filter: { $exist: { foo: true } } })
  t.equal(result.length, 3)
  for (let i = 0; i < result.length; i++) {
    t.equal('id' in result[i], true)
    t.equal('foo' in result[i], true)
    t.equal('createdAt' in result[i], true)
    t.equal('updatedAt' in result[i], true)
  }
})

t.test('count', async function (t) {
  t.plan(2)
  const db = await build(t)
  const collection = db.collection('count')

  const ctr = new Controller(collection, { logger: { level: 'silent' }, searchFields: ['foo'] })
  await ctr.insertMany([{ foo: 'bar' }, { foo: 'baz' }, { foo: 'foo' }])

  let result = await ctr.count({ search: 'bar' })
  t.equal(result, 1)

  result = await ctr.count({ filter: { $exist: { foo: true } } })
  t.equal(result, 3)
})
