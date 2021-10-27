/* eslint-disable @typescript-eslint/method-signature-style */
import EventEmitter from '@kakang/eventemitter'
import AggregateBuilder, { MatchPipeline, SortPipeline } from '@kakang/mongodb-aggregate-builder'
import * as Validator from '@kakang/validator'
import { BulkWriteOptions, Collection, DeleteOptions, Document, Filter, FindOptions, InsertOneOptions, OptionalId, UpdateFilter, UpdateOptions } from 'mongodb'
import { P } from 'pino'
import * as uuid from 'uuid'
import { kAppendBasicSchema, kAppendUpdatedSchema, kCollection, kCreateIndex, kFindNextPair, kNormalizeFilter, kTransformRegExpSearch } from '../constant'
import { createLogger } from '../logger'
import { isUpdateQuery, OptionalBasicSchema } from '../util'

export interface ControllerOptions {
  logger?: P.LoggerOptions | P.BaseLogger
  searchFields?: string[]
  autoRegExpSearch?: boolean
  buildAggregateBuilder?: () => AggregateBuilder
}

export class Controller<TSchema extends Document = Document> extends EventEmitter {
  private [kCollection]: Collection<TSchema>
  collectionName: string
  logger: P.BaseLogger
  searchFields: string[]
  autoRegExpSearch: boolean

  get collection (): Collection<TSchema> {
    return this[kCollection]
  }

  set collection (collection: Collection<TSchema> | undefined) {
    if (Validator.isEmpty(collection)) throw new Error('collection cannot be empty')
    this[kCollection] = collection
  }

  constructor (collection?: Collection<any>, options?: ControllerOptions) {
    super()
    this.collection = collection
    this.collectionName = this.collection.collectionName
    this.logger = createLogger(this.collectionName, options?.logger)
    this.searchFields = options?.searchFields ?? []
    this.autoRegExpSearch = options?.autoRegExpSearch ?? false
    this[kCreateIndex]()
    void this.createIndex()
    void this.emit('created')
    this.logger.debug({ func: 'constructor' }, 'create controller [%s] with options %j', this.collectionName, options)
  }

  /**
   * Index
   */
  [kCreateIndex] (): void {
    this.logger.trace({ func: 'Symbol("createIndex")' })
    // we do not wait for index creation
    this.collection.createIndex({ id: 1 }, { unique: true }, () => {})
  }

  /**
   * Optional Create Index
   */
  createIndex (): Promise<void> | void {
    this.logger.debug({ func: 'createIndex' })
  }

  [kAppendBasicSchema] (docs: TSchema | TSchema[]): TSchema | TSchema[] {
    this.logger.trace({ func: 'Symbol("appendBasicSchema")' }, '')
    const now = new Date()
    if (Validator.isArray(docs)) {
      return docs.map(function (d) {
        return Object.assign({}, d, {
          id: uuid.v4(),
          createdAt: now,
          updatedAt: now
        })
      })
    } else {
      return Object.assign({}, docs, {
        id: uuid.v4(),
        createdAt: now,
        updatedAt: now
      })
    }
  }

  [kAppendUpdatedSchema] (docs: UpdateFilter<TSchema> | Partial<TSchema>): TSchema | UpdateFilter<TSchema> {
    this.logger.trace({ func: 'Symbol("appendUpdatedSchema")' })
    if (isUpdateQuery(docs)) {
      const item: OptionalBasicSchema<TSchema> = this[kAppendBasicSchema](docs.$set as TSchema)
      delete item.id
      delete item.createdAt
      docs.$set = item
      return docs
    } else {
      const result: OptionalBasicSchema<TSchema> = this[kAppendBasicSchema](docs as TSchema)
      delete result.id
      delete result.createdAt
      return result
    }
  }

  [kNormalizeFilter] (text: string | object): unknown {
    this.logger.trace({ func: 'Symbol("normalizeFilter")' }, 'normalize %s - %j', typeof text, text)
    const normalize = this[kNormalizeFilter].bind(this)
    // security guard
    const tmp = Validator.isObject(text) && !Validator.isNull(text) ? JSON.stringify(text) : String(text)
    if (tmp.includes('$function') || tmp.includes('$accumulator')) {
      this.logger.error({ func: 'Symbol("normalizeFilter")' }, 'invalid operator found - %j', text)
      throw new Error('invalid operator found')
    }
    // start normalize
    if (Validator.isString(text) && text.startsWith('{') && text.endsWith('}')) {
      return normalize(JSON.parse(text))
    }
    if (tmp.toLocaleLowerCase() === 'true') {
      return true
    }
    if (tmp.toLocaleLowerCase() === 'false') {
      return false
    }
    if (!isNaN(tmp as never as number)) {
      return Number(tmp)
    }
    if (Validator.Date.isISO8601Date(tmp)) {
      return new Date(tmp)
    }
    if (Validator.isArray(text)) {
      return text.map(normalize)
    }
    if (!Validator.isNumber(text) && !Validator.isString(text) && Validator.isJSON(text)) {
      const o = JSON.parse(tmp)
      Object.entries(o).forEach(function ([k, v]) {
        // keep $expr $dateFromString work as before
        // $regex must be string
        if (k === 'dateString' || k === '$regex') {
          o[k] = String(v)
        } else {
          o[k] = normalize(v as string)
        }
      })
      return o
    }
    return text
  }

  [kTransformRegExpSearch] (text: string | object): unknown {
    this.logger.trace({ func: 'Symbol("transformRegExpSearch")' }, 'transform %s - %j', typeof text, text)
    if (typeof text === 'string' && !text.startsWith('{') && !text.endsWith('}')) {
      return { $regex: text, $options: 'i' }
    } else {
      return text
    }
  }

  [kFindNextPair] (text: string, startIndex = 0): { startIndex: number, endIndex: number, key: string, value: string } {
    const start = ['{', '[']
    const end = ['}', ']']
    const allowedKey = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.$'
    const delimiter = [':', ',']
    let key = ''
    let value = ''
    let endIndex = 0
    let foundKey = false
    let nested = 0

    for (let i = startIndex; i < text.length; i++) {
      const char = text[i]
      if (!foundKey) {
        // looking for key
        if (allowedKey.includes(char)) key += char
        else if (char === delimiter[0]) foundKey = true
      } else {
        // looking for value
        if (start.includes(char)) nested++
        if (end.includes(char)) nested--
        if (nested === 0 && char === delimiter[1]) {
          endIndex = i + 1
          break
        }
        value += char
      }
    }

    return {
      startIndex,
      endIndex,
      key,
      value
    }
  }

  async count (search?: string, filter?: string): Promise<number> {
    this.logger.debug({ func: 'count' }, 'counting for %s with %s', search, filter)
    await this.emit('pre-count', search, filter)
    const found = await this.search(search, filter)
    const result = found.length
    this.logger.debug({ func: 'count' }, 'counted for %s with %s - %n', search, filter, result)
    await this.emit('post-count', result, search, filter)
    return result
  }

  async search<U = TSchema> (search?: string, filter?: string, sort?: string, page?: number, pageSize?: number): Promise<U[]> {
    this.logger.debug({ func: 'search' }, 'search for %s with %s sorted by %s at page %n with size %n %n', search, filter, sort, page, pageSize)
    await this.emit('pre-search', search, filter, sort, page, pageSize)
    const pipeline = this.computePipeline(search, filter, sort, page, pageSize).toArray()
    const result = await this.collection.aggregate<U>(pipeline).toArray()
    await this.emit('post-search', result, search, filter, sort, page, pageSize)
    return result
  }

  async insertOne (docs: TSchema, options?: InsertOneOptions): Promise<TSchema | null> {
    this.logger.debug({ func: 'insertOne', docs }, 'insert document with option %j', options)
    const doc = this[kAppendBasicSchema](docs)
    await this.emit('pre-insert-one', doc, options)
    await this.collection.insertOne(doc as OptionalId<TSchema>, options as InsertOneOptions)
    const result = await this.collection.findOne<TSchema>({ id: doc.id })
    await this.emit('post-insert-one', result, doc, options)
    this.logger.debug({ func: 'insertOne', docs: result }, 'inserted document with option %j', options)
    return result
  }

  async insertMany (docs: TSchema[], options?: BulkWriteOptions): Promise<TSchema[]> {
    this.logger.debug({ func: 'insertMany', docs }, 'insert documents with option %j', options)
    const doc = this[kAppendBasicSchema](docs)
    await this.emit('pre-insert-many', doc, options)
    await this.collection.insertMany(doc as Array<OptionalId<TSchema>>, options as BulkWriteOptions)
    const result = await this.collection.find<TSchema>({ id: { $in: doc.map((d) => d.id) } }, { sort: { createdAt: 1 } }).toArray()
    await this.emit('post-insert-many', result, doc, options)
    this.logger.debug({ func: 'insertMany', docs: result }, 'inserted documents with option %j', options)
    return result
  }

  async find (filter: Filter<TSchema>, options?: FindOptions<TSchema>): Promise<TSchema[]> {
    this.logger.debug({ func: 'find' }, 'find documents for %j with option %j', filter, options)
    await this.emit('pre-find', filter, options)
    const result = await this.collection.find(filter, options as FindOptions<TSchema>).toArray()
    await this.emit('post-find', result, filter, options)
    return result
  }

  async findOne (filter: Filter<TSchema>, options?: FindOptions<TSchema>): Promise<TSchema | null> {
    this.logger.debug({ func: 'findOne' }, 'find document for %j with option %j', filter, options)
    await this.emit('pre-find-one', filter, options)
    const result = await this.collection.findOne(filter, options)
    await this.emit('post-find-one', result, filter, options)
    return result as TSchema
  }

  async findById (id: string, options?: FindOptions<TSchema>): Promise<TSchema | null> {
    this.logger.debug({ func: 'findById' }, 'find document by id %s with option %j', id, options)
    await this.emit('pre-find-by-id', id, options)
    const filter: Filter<TSchema> = { id } as unknown as Filter<TSchema>
    const result = await this.collection.findOne(filter, options)
    await this.emit('post-find-by-id', result, id, options)
    return result as unknown as TSchema
  }

  async updateOne (filter: Filter<TSchema>, docs: UpdateFilter<TSchema> | Partial<TSchema>, options?: UpdateOptions): Promise<TSchema | null> {
    this.logger.debug({ func: 'updateOne', docs }, 'update document for %j with option %j', filter, options)
    const doc = this[kAppendUpdatedSchema](docs)
    await this.emit('pre-update-one', filter, doc, options)
    if (isUpdateQuery(doc)) {
      await this.collection.updateOne(filter, doc, options as UpdateOptions)
    } else {
      await this.collection.updateOne(filter, { $set: doc }, options as UpdateOptions)
    }
    const result = await this.collection.findOne(filter)
    await this.emit('post-update-one', result, filter, doc, options)
    this.logger.debug({ func: 'updateOne', docs: result }, 'updated document for %j with option %j', filter, options)
    return result as TSchema
  }

  async updateMany (filter: Filter<TSchema>, docs: UpdateFilter<TSchema> | Partial<TSchema>, options?: UpdateOptions): Promise<TSchema[]> {
    this.logger.debug({ func: 'updateMany', docs }, 'update documents for %j with option %j', filter, options)
    const doc = this[kAppendUpdatedSchema](docs)
    await this.emit('pre-update-many', filter, doc, options)
    if (isUpdateQuery(doc)) {
      await this.collection.updateMany(filter, doc, options as UpdateOptions)
    } else {
      await this.collection.updateMany(filter, { $set: doc }, options as UpdateOptions)
    }
    const result = await this.collection.find(filter).toArray()
    await this.emit('post-update-many', result, filter, doc, options)
    this.logger.debug({ func: 'updateMany', docs: result }, 'update documents for %j with option %j', filter, options)
    return result
  }

  async updateById (id: string, docs: UpdateFilter<TSchema> | Partial<TSchema>, options?: UpdateOptions): Promise<TSchema | null> {
    this.logger.debug({ func: 'updateById', docs }, 'update document by id %s with option %j', id, options)
    const doc = this[kAppendUpdatedSchema](docs)
    await this.emit('pre-update-by-id', id, doc, options)
    const filter: Filter<TSchema> = { id } as unknown as Filter<TSchema>
    if (isUpdateQuery(doc)) {
      await this.collection.updateOne(filter, doc, options as UpdateOptions)
    } else {
      await this.collection.updateOne(filter, { $set: doc }, options as UpdateOptions)
    }
    const result = await this.collection.findOne(filter, options)
    await this.emit('post-update-by-id', result, id, doc, options)
    this.logger.debug({ func: 'updateById', docs: result }, 'update document by id %s with option %j', id, options)
    return result as unknown as TSchema
  }

  async deleteOne (filter: Filter<TSchema>, options?: DeleteOptions): Promise<TSchema | null> {
    this.logger.debug({ func: 'deleteOne' }, 'delete document for %j with option %j', filter, options)
    const result = await this.collection.findOne(filter)
    await this.emit('pre-delete-one', filter, options)
    await this.collection.deleteOne(filter, options as DeleteOptions)
    await this.emit('post-delete-one', result, filter, options)
    this.logger.debug({ func: 'deleteOne', docs: result }, 'deleted document for %j with option %j', filter, options)
    return result
  }

  async deleteMany (filter: Filter<TSchema>, options?: DeleteOptions): Promise<TSchema[]> {
    this.logger.debug({ func: 'deleteMany' }, 'delete documents for %j with option %j', filter, options)
    const result = await this.collection.find(filter).toArray()
    await this.emit('pre-delete-many', filter, options)
    await this.collection.deleteMany(filter, options as DeleteOptions)
    await this.emit('post-delete-many', result, filter, options)
    this.logger.debug({ func: 'deleteMany', docs: result }, 'deleted documents for %j with option %j', filter, options)
    return result
  }

  async deleteById (id: string, options?: DeleteOptions): Promise<TSchema | null> {
    this.logger.debug({ func: 'deleteById' }, 'update document by id %s with option %j', id, options)
    const filter: Filter<TSchema> = { id } as unknown as Filter<TSchema>
    const result = await this.collection.findOne<TSchema>(filter, options)
    await this.emit('pre-delete-by-id', id, options)
    await this.collection.deleteOne(filter, options as DeleteOptions)
    await this.emit('post-delete-by-id', result, id, options)
    this.logger.debug({ func: 'deleteById', docs: result }, 'update document by id %s with option %j', id, options)
    return result
  }

  async resetDatabase (): Promise<boolean> {
    this.logger.trace({ func: 'resetDatabase' })
    await this.emit('pre-reset')
    await this.collection.drop()
    await this[kCreateIndex]()
    await this.createIndex()
    await this.emit('post-reset')
    return true
  }

  // query format search=<string> filter=foo:a,bar:b
  computeQuery (search?: any, filter?: any, ..._args: any[]): AggregateBuilder {
    const normalize = this[kNormalizeFilter].bind(this)
    const transformRegExpSearch = this[kTransformRegExpSearch].bind(this)
    this.logger.trace({ func: 'computeQuery', search, filter }, 'compute query')
    const opt: MatchPipeline = {}
    const arr: any[] = []
    const builder = new AggregateBuilder()
    if ((Validator.isString(search) || Validator.isObject(search)) && Validator.isExist(search) && this.searchFields.length > 0) {
      // search should use regex to maximize search result
      if (this.autoRegExpSearch) { search = transformRegExpSearch(search) }
      const sub: any[] = []
      this.searchFields.forEach(function (fields) {
        sub.push({ [fields]: normalize(search) })
      })
      arr.push({ $or: sub })
    }
    if (typeof filter === 'string') {
      if (!filter.endsWith(',')) filter = filter + ','
      for (let i = 0; i <= filter.length; i++) {
        const { endIndex, key, value } = this[kFindNextPair](filter, i)
        if (key === '' && value === '') break
        arr.push({ [key]: normalize(value) })
        i = endIndex - 1
      }
    }
    if (arr.length > 0) {
      opt.$and = arr
    }
    builder.match(opt)
    return builder
  }

  // sort format +foo,-bar (+) can be omit
  computeSort (sort?: string): AggregateBuilder | false {
    this.logger.trace({ func: 'computeQuery', sort }, 'compute sort')
    if (typeof sort === 'string') {
      const opt: SortPipeline = {}
      const builder = new AggregateBuilder()
      sort.split(',').forEach(function (o) {
        const orderKey = o.startsWith('-') ? '-' : '+'
        const key = o.replace(orderKey, '').trim()
        const order = orderKey === '-' ? -1 : 1
        // prevent empty key
        if (Validator.isExist(key)) opt[key] = order
      })
      builder.sort(opt)
      return builder
    } else {
      return false
    }
  }

  computeOption (page?: number, pageSize?: number): AggregateBuilder | false {
    this.logger.trace({ func: 'computeOption', page, pageSize }, 'compute option')
    if (typeof page !== 'undefined' && typeof pageSize !== 'undefined') {
      const builder = new AggregateBuilder()
      const skip = page > 0 ? (page - 1) * pageSize : 0
      builder.limit(pageSize + skip)
      builder.skip(skip)
      return builder
    } else {
      return false
    }
  }

  computePipeline (search?: string, filter?: string, sort?: string, page?: number, pageSize?: number): AggregateBuilder {
    this.logger.trace({ func: 'computePipeline', search, filter, sort, page, pageSize }, 'compute pipeline')
    const builder = this.buildAggregateBuilder()
    builder.concat(this.computeQuery(search, filter))
    const s = this.computeSort(sort)
    if (s !== false) builder.concat(s)
    const p = this.computeOption(page, pageSize)
    if (p !== false) builder.concat(p)
    return builder
  }

  buildAggregateBuilder (): AggregateBuilder {
    return new AggregateBuilder()
  }
}

/**
 * Overload Methods
 */
export interface Controller<TSchema extends Document = Document> {
  [kAppendBasicSchema] (docs: TSchema): TSchema
  [kAppendBasicSchema] (docs: TSchema[]): TSchema[]
  [kAppendUpdatedSchema] (docs: TSchema): TSchema
  [kAppendUpdatedSchema] (docs: UpdateFilter<TSchema>): UpdateFilter<TSchema>

  on (event: 'created', callback: () => void | Promise<void>): this
  on (event: 'pre-reset', callback: () => void | Promise<void>): this
  on (event: 'post-reset', callback: () => void | Promise<void>): this
  on (event: 'pre-insert-one', callback: (docs: TSchema, options?: InsertOneOptions) => void | Promise<void>): this
  on (event: 'post-insert-one', callback: (result: TSchema | null, docs: TSchema, options?: InsertOneOptions) => void | Promise<void>): this
  on (event: 'pre-insert-many', callback: (docs: TSchema[], options?: BulkWriteOptions) => void | Promise<void>): this
  on (event: 'post-insert-many', callback: (result: TSchema[], docs: TSchema[], options?: BulkWriteOptions) => void | Promise<void>): this
  on (event: 'pre-find', callback: (filter: Filter<TSchema>, options?: FindOptions<TSchema>) => void | Promise<void>): this
  on (event: 'post-find', callback: (result: TSchema[], filter: Filter<TSchema>, options?: FindOptions<TSchema>) => void | Promise<void>): this
  on (event: 'pre-find-one', callback: (filter: Filter<TSchema>, options?: FindOptions<TSchema>) => void | Promise<void>): this
  on (event: 'post-find-one', callback: (result: TSchema | null, filter: Filter<TSchema>, options?: FindOptions<TSchema>) => void | Promise<void>): this
  on (event: 'pre-find-by-id', callback: (id: string, options?: FindOptions<TSchema>) => void | Promise<void>): this
  on (event: 'post-find-by-id', callback: (result: TSchema | null, id: string, options?: FindOptions<TSchema>) => void | Promise<void>): this
  on (event: 'pre-update-one', callback: (filter: Filter<TSchema>, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  on (event: 'post-update-one', callback: (result: TSchema | null, filter: Filter<TSchema>, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  on (event: 'pre-update-many', callback: (filter: Filter<TSchema>, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  on (event: 'post-update-many', callback: (result: TSchema[], filter: Filter<TSchema>, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  on (event: 'pre-update-by-id', callback: (id: string, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  on (event: 'post-update-by-id', callback: (result: TSchema | null, id: string, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  on (event: 'pre-delete-one', callback: (filter: Filter<TSchema>, options?: DeleteOptions) => void | Promise<void>): this
  on (event: 'post-delete-one', callback: (result: TSchema | null, filter: Filter<TSchema>, options?: DeleteOptions) => void | Promise<void>): this
  on (event: 'pre-delete-many', callback: (filter: Filter<TSchema>, options?: DeleteOptions) => void | Promise<void>): this
  on (event: 'post-delete-many', callback: (result: TSchema[], filter: Filter<TSchema>, options?: DeleteOptions) => void | Promise<void>): this
  on (event: 'pre-delete-by-id', callback: (id: string, options?: DeleteOptions) => void | Promise<void>): this
  on (event: 'post-delete-by-id', callback: (result: TSchema | null, id: string, options?: DeleteOptions) => void | Promise<void>): this

  once (event: 'created', callback: () => void | Promise<void>): this
  once (event: 'pre-reset', callback: () => void | Promise<void>): this
  once (event: 'post-reset', callback: () => void | Promise<void>): this
  once (event: 'pre-insert-one', callback: (docs: TSchema, options?: InsertOneOptions) => void | Promise<void>): this
  once (event: 'post-insert-one', callback: (result: TSchema | null, docs: TSchema, options?: InsertOneOptions) => void | Promise<void>): this
  once (event: 'pre-insert-many', callback: (docs: TSchema[], options?: BulkWriteOptions) => void | Promise<void>): this
  once (event: 'post-insert-many', callback: (result: TSchema[], docs: TSchema[], options?: BulkWriteOptions) => void | Promise<void>): this
  once (event: 'pre-find', callback: (filter: Filter<TSchema>, options?: FindOptions<TSchema>) => void | Promise<void>): this
  once (event: 'post-find', callback: (result: TSchema[], filter: Filter<TSchema>, options?: FindOptions<TSchema>) => void | Promise<void>): this
  once (event: 'pre-find-one', callback: (filter: Filter<TSchema>, options?: FindOptions<TSchema>) => void | Promise<void>): this
  once (event: 'post-find-one', callback: (result: TSchema | null, filter: Filter<TSchema>, options?: FindOptions<TSchema>) => void | Promise<void>): this
  once (event: 'pre-find-by-id', callback: (id: string, options?: FindOptions<TSchema>) => void | Promise<void>): this
  once (event: 'post-find-by-id', callback: (result: TSchema | null, id: string, options?: FindOptions<TSchema>) => void | Promise<void>): this
  once (event: 'pre-update-one', callback: (filter: Filter<TSchema>, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  once (event: 'post-update-one', callback: (result: TSchema | null, filter: Filter<TSchema>, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  once (event: 'pre-update-many', callback: (filter: Filter<TSchema>, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  once (event: 'post-update-many', callback: (result: TSchema[], filter: Filter<TSchema>, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  once (event: 'pre-update-by-id', callback: (id: string, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  once (event: 'post-update-by-id', callback: (result: TSchema | null, id: string, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  once (event: 'pre-delete-one', callback: (filter: Filter<TSchema>, options?: DeleteOptions) => void | Promise<void>): this
  once (event: 'post-delete-one', callback: (result: TSchema | null, filter: Filter<TSchema>, options?: DeleteOptions) => void | Promise<void>): this
  once (event: 'pre-delete-many', callback: (filter: Filter<TSchema>, options?: DeleteOptions) => void | Promise<void>): this
  once (event: 'post-delete-many', callback: (result: TSchema[], filter: Filter<TSchema>, options?: DeleteOptions) => void | Promise<void>): this
  once (event: 'pre-delete-by-id', callback: (id: string, options?: DeleteOptions) => void | Promise<void>): this
  once (event: 'post-delete-by-id', callback: (result: TSchema | null, id: string, options?: DeleteOptions) => void | Promise<void>): this

  addListener (event: 'created', callback: () => void | Promise<void>): this
  addListener (event: 'pre-reset', callback: () => void | Promise<void>): this
  addListener (event: 'post-reset', callback: () => void | Promise<void>): this
  addListener (event: 'pre-insert-one', callback: (docs: TSchema, options?: InsertOneOptions) => void | Promise<void>): this
  addListener (event: 'post-insert-one', callback: (result: TSchema | null, docs: TSchema, options?: InsertOneOptions) => void | Promise<void>): this
  addListener (event: 'pre-insert-many', callback: (docs: TSchema[], options?: BulkWriteOptions) => void | Promise<void>): this
  addListener (event: 'post-insert-many', callback: (result: TSchema[], docs: TSchema[], options?: BulkWriteOptions) => void | Promise<void>): this
  addListener (event: 'pre-find', callback: (filter: Filter<TSchema>, options?: FindOptions<TSchema>) => void | Promise<void>): this
  addListener (event: 'post-find', callback: (result: TSchema[], filter: Filter<TSchema>, options?: FindOptions<TSchema>) => void | Promise<void>): this
  addListener (event: 'pre-find-one', callback: (filter: Filter<TSchema>, options?: FindOptions<TSchema>) => void | Promise<void>): this
  addListener (event: 'post-find-one', callback: (result: TSchema | null, filter: Filter<TSchema>, options?: FindOptions<TSchema>) => void | Promise<void>): this
  addListener (event: 'pre-find-by-id', callback: (id: string, options?: FindOptions<TSchema>) => void | Promise<void>): this
  addListener (event: 'post-find-by-id', callback: (result: TSchema | null, id: string, options?: FindOptions<TSchema>) => void | Promise<void>): this
  addListener (event: 'pre-update-one', callback: (filter: Filter<TSchema>, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  addListener (event: 'post-update-one', callback: (result: TSchema | null, filter: Filter<TSchema>, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  addListener (event: 'pre-update-many', callback: (filter: Filter<TSchema>, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  addListener (event: 'post-update-many', callback: (result: TSchema[], filter: Filter<TSchema>, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  addListener (event: 'pre-update-by-id', callback: (id: string, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  addListener (event: 'post-update-by-id', callback: (result: TSchema | null, id: string, docs: TSchema, options?: UpdateOptions) => void | Promise<void>): this
  addListener (event: 'pre-delete-one', callback: (filter: Filter<TSchema>, options?: DeleteOptions) => void | Promise<void>): this
  addListener (event: 'post-delete-one', callback: (result: TSchema | null, filter: Filter<TSchema>, options?: DeleteOptions) => void | Promise<void>): this
  addListener (event: 'pre-delete-many', callback: (filter: Filter<TSchema>, options?: DeleteOptions) => void | Promise<void>): this
  addListener (event: 'post-delete-many', callback: (result: TSchema[], filter: Filter<TSchema>, options?: DeleteOptions) => void | Promise<void>): this
  addListener (event: 'pre-delete-by-id', callback: (id: string, options?: DeleteOptions) => void | Promise<void>): this
  addListener (event: 'post-delete-by-id', callback: (result: TSchema | null, id: string, options?: DeleteOptions) => void | Promise<void>): this
}
