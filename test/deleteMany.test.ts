import t from 'tap'
import Controller from '../lib'
import { build } from './utils/factory'

t.plan(1)
t.test('deleteMany', async function (t) {
  t.plan(1)
  const docs = { foo: 'bar' }

  const db = await build(t)
  const ctr = new Controller(db.collection('deleteMany'))
  await ctr.insertMany([docs, docs, docs])

  t.test('3 result', async function (t) {
    t.plan(13)
    const result = await ctr.deleteMany({})
    t.equal(result.length, 3)
    t.equal('foo' in result[0], true)
    t.equal('id' in result[0], true)
    t.equal('createdAt' in result[0], true)
    t.equal('updatedAt' in result[0], true)
    t.equal('foo' in result[1], true)
    t.equal('id' in result[1], true)
    t.equal('createdAt' in result[1], true)
    t.equal('updatedAt' in result[1], true)
    t.equal('foo' in result[2], true)
    t.equal('id' in result[2], true)
    t.equal('createdAt' in result[2], true)
    t.equal('updatedAt' in result[2], true)
  })
})
