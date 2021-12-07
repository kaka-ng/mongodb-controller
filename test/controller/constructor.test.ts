import Pino from 'pino'
import t from 'tap'
import { Controller } from '../../lib/controller/default'
import { build } from '../utils/factory'

t.test('constructor', async function (t) {
  t.plan(6 * 2 + 1)

  const db = await build(t)
  const collection = db.collection('constructor')
  // no option
  let controller
  controller = new Controller(collection)
  t.equal(controller instanceof Controller, true)
  t.equal(controller.collection, collection)
  // logger option
  controller = new Controller(collection, { logger: { level: 'trace' } })
  t.equal(controller instanceof Controller, true)
  t.equal(controller.collection, collection)
  // logger option
  controller = new Controller(collection, { logger: {} })
  t.equal(controller instanceof Controller, true)
  t.equal(controller.collection, collection)
  // logger option
  controller = new Controller(collection, { logger: undefined })
  t.equal(controller instanceof Controller, true)
  t.equal(controller.collection, collection)
  // custom logger
  const logger = Pino({ name: 'bcdefg' })
  controller = new Controller(collection, { logger })
  t.equal(controller instanceof Controller, true)
  t.equal(controller.collection, collection)
  // empty option
  controller = new Controller(collection, { })
  t.equal(controller instanceof Controller, true)
  t.equal(controller.collection, collection)
  // should fail
  try {
    // eslint-disable-next-line no-new
    new Controller()
    t.fail()
  } catch (err: any) {
    t.equal(err.message, 'collection expected to be an object, but recieved "undefined"')
  }
})
