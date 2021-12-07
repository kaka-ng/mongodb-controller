import t from 'tap'
import { Controller } from '../../lib/controller/default'
import { build } from '../utils/factory'

t.test('find', async function (t) {
  t.plan(4 * 3 + 2)
  const db = await build(t)
  const collection = db.collection('find')

  const ctr = new Controller(collection, { logger: { level: 'silent' } })
  await ctr.insertMany([{ foo: 'bar' }, { foo: 'bar' }, { foo: 'bar' }])

  let result = await ctr.find()
  t.equal(result.length, 3)
  for (let i = 0; i < result.length; i++) {
    t.equal('id' in result[i], true)
    t.equal('foo' in result[i], true)
    t.equal('createdAt' in result[i], true)
    t.equal('updatedAt' in result[i], true)
  }

  result = await ctr.find({ foo: 'baz' })
  t.equal(result.length, 0)
})
