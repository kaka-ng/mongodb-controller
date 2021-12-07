import t from 'tap'
import { Controller } from '../../lib/controller/default'
import { build } from '../utils/factory'

t.test('findById', async function (t) {
  t.plan(5 + 1 + 1)
  const db = await build(t)
  const collection = db.collection('findById')

  const ctr = new Controller(collection, { logger: { level: 'silent' } })
  const inserted = await ctr.insertMany([{ foo: 'bar' }, { foo: 'bar' }, { foo: 'bar' }])

  let result = await ctr.findById(inserted[0].id)
  t.ok(result)
  if (result !== null) {
    t.equal(result.id, inserted[0].id)
    t.equal('id' in result, true)
    t.equal('foo' in result, true)
    t.equal('createdAt' in result, true)
    t.equal('updatedAt' in result, true)
  }

  result = await ctr.findById('not-exist')
  t.equal(result, null)
})
