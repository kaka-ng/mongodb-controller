import Pino from 'pino'
import t from 'tap'
import Controller from '../lib'
import { build } from './utils/factory'

t.plan(1)
t.test('constructor', async function (t) {
  t.plan(5)

  const db = await build(t)

  t.test('collection', function (t) {
    t.plan(1)
    const ctr = new Controller(db.collection('constructor'))
    t.equal(ctr instanceof Controller, true)
  })

  t.test('options', function (t) {
    t.plan(1)
    const ctr = new Controller(db.collection('constructor'), { logger: { level: 'trace' } })
    t.equal(ctr instanceof Controller, true)
  })

  t.test('options', function (t) {
    t.plan(2)
    const logger = Pino({ name: 'bcdefg' })
    const ctr = new Controller(db.collection('constructor'), { logger: logger })
    t.equal(ctr instanceof Controller, true)
    t.same(ctr.logger, logger)
  })

  t.test('empty options', function (t) {
    t.plan(1)
    const ctr = new Controller(db.collection('constructor'), { })
    t.equal(ctr instanceof Controller, true)
  })

  t.test('undefined', function (t) {
    t.plan(1)
    try {
      // eslint-disable-next-line no-new
      new Controller()
      t.fail()
    } catch (err) {
      t.ok(err)
    }
  })
})
