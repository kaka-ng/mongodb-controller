import t from 'tap'
import Controller from '../lib'
import { build } from './utils/factory'

t.plan(1)
t.test('updateMany', async function (t) {
  t.plan(2)

  const docs = { foo: 'bar' }
  const db = await build(t)
  const ctr = new Controller(db.collection('updateMany'))
  await ctr.insertMany([docs, docs, docs])

  t.test('3 result', async function (t) {
    t.plan(13)
    const result = await ctr.updateMany({}, {
      bar: 'baz'
    })
    t.equal(result.length, 3)
    t.equal('bar' in result[0], true)
    t.equal('id' in result[0], true)
    t.equal('createdAt' in result[0], true)
    t.equal('updatedAt' in result[0], true)
    t.equal('bar' in result[1], true)
    t.equal('id' in result[1], true)
    t.equal('createdAt' in result[1], true)
    t.equal('updatedAt' in result[1], true)
    t.equal('bar' in result[2], true)
    t.equal('id' in result[2], true)
    t.equal('createdAt' in result[2], true)
    t.equal('updatedAt' in result[2], true)
  })

  t.test('update query', async function (t) {
    t.plan(13)
    const result = await ctr.updateMany({}, {
      $set: {
        hello: 'world'
      }
    })
    t.equal(result.length, 3)
    t.equal('hello' in result[0], true)
    t.equal('id' in result[0], true)
    t.equal('createdAt' in result[0], true)
    t.equal('updatedAt' in result[0], true)
    t.equal('hello' in result[1], true)
    t.equal('id' in result[1], true)
    t.equal('createdAt' in result[1], true)
    t.equal('updatedAt' in result[1], true)
    t.equal('hello' in result[2], true)
    t.equal('id' in result[2], true)
    t.equal('createdAt' in result[2], true)
    t.equal('updatedAt' in result[2], true)
  })
})
