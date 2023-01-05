/* eslint-disable @typescript-eslint/method-signature-style */
import EventEmitter from '@kakang/eventemitter'
import AggregateBuilder, { MatchPipeline, SortPipeline } from '@kakang/mongodb-aggregate-builder'
import { isEmpty, isExist, isObject, isString } from '@kakang/validator'
import { AggregateOptions, BulkWriteOptions, Collection, CreateIndexesOptions, DeleteOptions, Document, Filter, FindOneAndDeleteOptions, FindOneAndUpdateOptions, FindOptions, IndexSpecification, InsertOneOptions, OptionalUnlessRequiredId, UpdateFilter, UpdateOptions } from 'mongodb'
import { P } from 'pino'
import { kCollection, kCreateIndex, kIndexes, kLogger, kSkipIndex } from '../symbols'
import { appendBasicSchema, appendUpdateSchema } from '../utils/append'
import { createLogger } from '../utils/logger'
import { noop } from '../utils/noop'
import { computeSharedOption } from '../utils/option'
import { findNextPair, normalize, normalizeQueryDate, transformRegExpSearch } from '../utils/query'

export interface MongoDBIndex {
  indexSpec: IndexSpecification
  options?: CreateIndexesOptions
}

export interface ControllerOptions {
  logger: P.LoggerOptions | P.BaseLogger
  skipIndex: boolean
  autoRegExpSearch: boolean
  searchFields: string[]
  postMatchKeywords: string[]
  indexes: MongoDBIndex[]
}

export interface SearchOptions {
  search?: string | Record<string, unknown>
  filter?: string | Record<string, unknown>
  sort?: string
  page?: number
  pageSize?: number
}

export class Controller<TSchema extends Document = Document> extends EventEmitter {
  private [kCollection]: Collection<TSchema>
  private [kLogger]: P.BaseLogger
  private [kIndexes]: MongoDBIndex[]
  private [kSkipIndex]: boolean

  autoRegExpSearch: boolean
  searchFields: string[]
  // used to check if we should append before aggregation
  // it is useful to reduce to time of heavy computation when
  // using aggregation
  postMatchKeywords: string[]

  get collection (): Collection<TSchema> {
    return this[kCollection]
  }

  set collection (collection: Collection<TSchema> | undefined) {
    if (isEmpty(collection)) throw new Error('collection expected to be an object, but recieved "' + typeof collection + '"')
    this[kCollection] = collection
  }

  get collectionName (): string {
    return this.collection.collectionName
  }

  get logger (): P.BaseLogger {
    return this[kLogger]
  }

  constructor (collection?: Collection<any>, options?: Partial<ControllerOptions>) {
    if (isEmpty(collection)) throw new Error('collection expected to be an object, but recieved "' + typeof collection + '"')
    super()
    // initialize private
    this[kCollection] = null as any
    this.collection = collection
    this[kLogger] = createLogger(this.collectionName, options?.logger)
    this[kIndexes] = [{ indexSpec: { id: 1 }, options: { unique: true } }]
    this[kIndexes].push(...(options?.indexes ?? []))
    this[kSkipIndex] = options?.skipIndex ?? false

    this.autoRegExpSearch = options?.autoRegExpSearch ?? true
    this.searchFields = options?.searchFields ?? []
    this.postMatchKeywords = options?.postMatchKeywords ?? []
    if (!this[kSkipIndex]) this[kCreateIndex]()

    this.emit('initialized').finally(noop)
    this.logger.debug({ func: 'constructor', meta: { options } }, 'created')
  }

  /**
   * Index
   */
  [kCreateIndex] (): void {
    this.logger.debug({ func: 'Symbol("createIndex")', meta: { indexes: this[kIndexes] } }, 'started')
    // we do not wait for index creation
    for (const index of this[kIndexes]) {
      this.collection.createIndex(index.indexSpec, index.options ?? {}, noop)
      this.logger.trace({ func: 'Symbol("createIndex")', meta: { index } }, 'index %j is created', index.indexSpec)
    }
    this.createIndex().finally(noop)
    this.logger.debug({ func: 'Symbol("createIndex")', meta: { indexes: this[kIndexes] } }, 'ended')
  }

  async createIndex (): Promise<void> {

  }

  async count (options?: Pick<SearchOptions, 'search' | 'filter'>, o?: AggregateOptions): Promise<number> {
    options ??= {}
    const { search, filter } = options
    this.logger.debug({ func: 'count', meta: { search, filter } }, 'started')
    await this.emit('pre-count', options)
    const builder = this.computePreQuery(options)
    builder.concat(this.buildAggregateBuilder(options))
    const postQuery = this.computePostQuery(options)
    if (postQuery !== false) builder.concat(postQuery)
    builder.count('count')
    const found = await this.collection.aggregate(builder.toArray(), o).toArray()
    const result = found.at(0)?.count ?? 0
    await this.emit('post-count', result, options)
    this.logger.debug({ func: 'count', meta: { search, filter } }, 'ended')
    return result
  }

  async search<U = TSchema> (options?: SearchOptions, o?: AggregateOptions): Promise<U[]> {
    this.logger.debug({ func: 'search', meta: options }, 'started')
    options ??= {}
    await this.emit('pre-search', options)
    const pipeline = this.computePipeline(options).toArray()
    const result = await this.collection.aggregate<U>(pipeline, o).toArray()
    await this.emit('post-search', result, options)
    this.logger.debug({ func: 'search', meta: options }, 'ended')
    return result
  }

  async insertOne (docs: TSchema, options?: InsertOneOptions): Promise<TSchema | null> {
    this.logger.debug({ func: 'insertOne', meta: { docs, options } }, 'started')
    options ??= {}
    const sharedOption = computeSharedOption(options)
    // single end-point for insert validation
    await this.emit('pre-insert', docs)
    const doc = appendBasicSchema(docs, this.appendBasicSchema)
    await this.emit('pre-insert-one', doc, options)
    await this.collection.insertOne(doc as OptionalUnlessRequiredId<TSchema>, options)
    const result = await this.collection.findOne<TSchema>({ id: doc.id }, sharedOption)
    await this.emit('post-insert-one', result, doc, options)
    // single end-point for insert, we do not allow to update result on this end-point
    await this.emit('post-insert')
    this.logger.debug({ func: 'insertOne', meta: { docs, options } }, 'ended')
    return result
  }

  async insertMany (docs: TSchema[], options?: BulkWriteOptions): Promise<TSchema[]> {
    this.logger.debug({ func: 'insertMany', meta: { docs, options } }, 'started')
    options ??= {}
    const sharedOption = computeSharedOption(options)
    // single end-point for insert validation
    await this.emit('pre-insert', docs)
    const doc = appendBasicSchema(docs, this.appendBasicSchema)
    await this.emit('pre-insert-many', doc, options)
    await this.collection.insertMany(doc as Array<OptionalUnlessRequiredId<TSchema>>, options)
    const result = await this.collection.find<TSchema>({ id: { $in: doc.map((d) => d.id) } }, { ...sharedOption, sort: { createdAt: 1 } }).toArray()
    await this.emit('post-insert-many', result, doc, options)
    // single end-point for insert, we do not allow to update result on this end-point
    await this.emit('post-insert')
    this.logger.debug({ func: 'insertMany', meta: { docs, options } }, 'ended')
    return result
  }

  async find (filter?: Filter<TSchema>, options?: FindOptions<TSchema>): Promise<TSchema[]> {
    this.logger.debug({ func: 'find', meta: { filter, options } }, 'started')
    options ??= {}
    filter ??= {}
    await this.emit('pre-find', filter, options)
    const result = await this.collection.find(filter, options).toArray()
    await this.emit('post-find', result, filter, options)
    this.logger.debug({ func: 'find', meta: { filter, options } }, 'ended')
    return result as TSchema[]
  }

  async findOne (filter?: Filter<TSchema>, options?: FindOptions<TSchema>): Promise<TSchema | null> {
    this.logger.debug({ func: 'findOne', meta: { filter, options } }, 'started')
    options ??= {}
    filter ??= {}
    await this.emit('pre-find-one', filter, options)
    const result = await this.collection.findOne(filter, options)
    await this.emit('post-find-one', result, filter, options)
    this.logger.debug({ func: 'findOne', meta: { filter, options } }, 'ended')
    return result as TSchema
  }

  async findById (id: string, options?: FindOptions<TSchema>): Promise<TSchema | null> {
    this.logger.debug({ func: 'findById', meta: { id, options } }, 'started')
    options ??= {}
    await this.emit('pre-find-by-id', id, options)
    const filter: Filter<TSchema> = { id } as unknown as Filter<TSchema>
    const result = await this.collection.findOne(filter, options)
    await this.emit('post-find-by-id', result, id, options)
    this.logger.debug({ func: 'findById', meta: { id, options } }, 'ended')
    return result as TSchema
  }

  async updateOne (filter: Filter<TSchema>, docs: UpdateFilter<TSchema> | Partial<TSchema>, options?: FindOneAndUpdateOptions): Promise<TSchema | null> {
    this.logger.debug({ func: 'updateOne', meta: { filter, docs, options } }, 'started')
    options ??= {}
    options.returnDocument ??= 'after'
    // single end-point for update validation
    await this.emit('pre-update', filter, docs)
    const doc = appendUpdateSchema(docs, this.appendBasicSchema)
    await this.emit('pre-update-one', filter, doc, options)
    const result = await this.collection.findOneAndUpdate(filter, normalizeQueryDate(doc), options)
    await this.emit('post-update-one', result.value, filter, doc, options)
    // single end-point for update, we do not allow to update result on this end-point
    await this.emit('post-update')
    this.logger.debug({ func: 'updateOne', meta: { filter, docs, options } }, 'ended')
    return result.value as TSchema
  }

  async updateMany (filter: Filter<TSchema>, docs: UpdateFilter<TSchema> | Partial<TSchema>, options?: UpdateOptions): Promise<TSchema[]> {
    this.logger.debug({ func: 'updateMany', meta: { filter, docs, options } }, 'started')
    options ??= {}
    const sharedOption = computeSharedOption(options)
    // single end-point for update validation
    await this.emit('pre-update', filter, docs)
    const doc = appendUpdateSchema(docs, this.appendBasicSchema)
    await this.emit('pre-update-many', filter, doc, options)
    const o = await this.collection.find(filter, sharedOption).toArray()
    await this.collection.updateMany(filter, normalizeQueryDate(doc), options)
    const result = await this.collection.find({ id: { $in: o.map((o) => o.id) } }, sharedOption).toArray()
    await this.emit('post-update-many', result, filter, doc, options)
    // single end-point for update, we do not allow to update result on this end-point
    await this.emit('post-update')
    this.logger.debug({ func: 'updateMany', meta: { filter, docs, options } }, 'ended')
    return result as unknown as TSchema[]
  }

  async updateById (id: string, docs: UpdateFilter<TSchema> | Partial<TSchema>, options?: FindOneAndUpdateOptions): Promise<TSchema | null> {
    this.logger.debug({ func: 'updateById', meta: { id, docs, options } }, 'started')
    options ??= {}
    options.returnDocument ??= 'after'
    // single end-point for update validation
    await this.emit('pre-update', { id }, docs)
    const doc = appendUpdateSchema(docs, this.appendBasicSchema)
    await this.emit('pre-update-by-id', id, doc, options)
    const filter: Filter<TSchema> = { id } as unknown as Filter<TSchema>
    const result = await this.collection.findOneAndUpdate(filter, normalizeQueryDate(doc), options)
    await this.emit('post-update-by-id', result.value, id, doc, options)
    // single end-point for update, we do not allow to update result on this end-point
    await this.emit('post-update')
    this.logger.debug({ func: 'updateById', meta: { id, docs, options } }, 'ended')
    return result.value as TSchema
  }

  async deleteOne (filter: Filter<TSchema>, options?: FindOneAndDeleteOptions): Promise<TSchema | null> {
    this.logger.debug({ func: 'deleteOne', meta: { filter, options } }, 'started')
    options ??= {}
    // single end-point for delete validation
    await this.emit('pre-delete', filter)
    await this.emit('pre-delete-one', filter, options)
    const result = await this.collection.findOneAndDelete(filter, options)
    await this.emit('post-delete-one', result.value, filter, options)
    // single end-point for delete, we do not allow to update result on this end-point
    await this.emit('post-delete')
    this.logger.debug({ func: 'deleteOne', meta: { filter, options } }, 'ended')
    return result.value as TSchema
  }

  async deleteMany (filter?: Filter<TSchema>, options?: DeleteOptions): Promise<TSchema[]> {
    this.logger.debug({ func: 'deleteMany', meta: { filter, options } }, 'started')
    options ??= {}
    filter ??= {}
    const sharedOption = computeSharedOption(options)
    // single end-point for delete validation
    await this.emit('pre-delete', filter)
    const result = await this.collection.find(filter, sharedOption).toArray()
    await this.emit('pre-delete-many', filter, options)
    await this.collection.deleteMany(filter, options)
    await this.emit('post-delete-many', result, filter, options)
    // single end-point for delete, we do not allow to update result on this end-point
    await this.emit('post-delete')
    this.logger.debug({ func: 'deleteMany', meta: { filter, options } }, 'ended')
    return result as TSchema[]
  }

  async deleteById (id: string, options?: FindOneAndDeleteOptions): Promise<TSchema | null> {
    this.logger.debug({ func: 'deleteById', meta: { id, options } }, 'started')
    options ??= {}
    // single end-point for delete validation
    await this.emit('pre-delete', { id })
    const filter: Filter<TSchema> = { id } as unknown as Filter<TSchema>
    await this.emit('pre-delete-by-id', id, options)
    const result = await this.collection.findOneAndDelete(filter, options)
    await this.emit('post-delete-by-id', result.value, id, options)
    // single end-point for delete, we do not allow to update result on this end-point
    await this.emit('post-delete')
    this.logger.debug({ func: 'deleteById', meta: { id, options } }, 'ended')
    return result.value as TSchema
  }

  appendBasicSchema (docs: TSchema): TSchema {
    return docs
  }

  // we filter first then reduce the area of aggregate
  computePreQuery (options: SearchOptions): AggregateBuilder {
    let { search, filter }: any = options
    this.logger.trace({ func: 'computePreQuery', meta: { search, filter } }, 'started')
    const opt: MatchPipeline = {}
    const arr: any[] = []
    const builder = new AggregateBuilder()
    if ((isString(search) || isObject(search)) && isExist(search) && (this.searchFields.length > 0)) {
      if (this.autoRegExpSearch) { search = transformRegExpSearch(search as any) }
      const sub: any[] = []
      const value = normalize(search)
      for (const field of this.searchFields) {
        let shouldAdd = true
        for (let i = 0; i < this.postMatchKeywords.length; i++) {
          if (!shouldAdd) break
          if (field.includes(this.postMatchKeywords[i])) shouldAdd = false
        }
        if (shouldAdd) sub.push({ [field]: value })
      }
      arr.push({ $or: sub })
    }

    if (typeof filter === 'string') {
      if (!filter.endsWith(',')) filter += ','
      for (let i = 0; i <= filter.length; i++) {
        const { endIndex, key, value } = findNextPair(filter, i)
        // when both value non-exist, it reach the end of loop
        if (key === '' && value === '') break
        // when value is non-exist, it is not a proper format
        if (value === '') { i = endIndex - 1; continue }
        let shouldAdd = true
        for (let j = 0; j < this.postMatchKeywords.length; j++) {
          if (!shouldAdd) break
          if (key.includes(this.postMatchKeywords[j])) shouldAdd = false
        }
        if (shouldAdd) arr.push({ [key]: normalize(value) })
        i = endIndex - 1
      }
    }
    if (typeof filter === 'object') {
      for (const key of Object.keys(filter)) {
        let shouldAdd = true
        for (let j = 0; j < this.postMatchKeywords.length; j++) {
          if (!shouldAdd) break
          if (key.includes(this.postMatchKeywords[j])) shouldAdd = false
        }
        if (shouldAdd) arr.push({ [key]: normalize(filter[key]) })
      }
    }

    if (arr.length > 0) opt.$and = arr
    builder.match(opt)
    this.logger.trace({ func: 'computePreQuery', meta: { search, filter } }, 'ended')
    return builder
  }

  // we filter first then reduce the area of aggregate
  computePostQuery (options: SearchOptions): AggregateBuilder | false {
    let { filter, search }: any = options
    this.logger.trace({ func: 'computePostQuery', meta: { filter } }, 'started')
    const opt: MatchPipeline = {}
    const arr: any[] = []
    const builder = new AggregateBuilder()
    if ((isString(search) || isObject(search)) && isExist(search) && (this.searchFields.length > 0)) {
      if (this.autoRegExpSearch) { search = transformRegExpSearch(search as any) }
      const sub: any[] = []
      const value = normalize(search)
      for (const field of this.searchFields) {
        let shouldAdd = false
        for (let i = 0; i < this.postMatchKeywords.length; i++) {
          if (shouldAdd) break
          if (field.includes(this.postMatchKeywords[i])) shouldAdd = true
        }
        if (shouldAdd) sub.push({ [field]: value })
      }
      arr.push({ $or: sub })
    }

    if (typeof filter === 'string') {
      if (!filter.endsWith(',')) filter += ','
      for (let i = 0; i <= filter.length; i++) {
        const { endIndex, key, value } = findNextPair(filter, i)
        // when both value non-exist, it reach the end of loop
        if (key === '' && value === '') break
        // when value is non-exist, it is not a proper format
        if (value === '') { i = endIndex - 1; continue }
        let shouldAdd = false
        for (let j = 0; j < this.postMatchKeywords.length; j++) {
          if (shouldAdd) break
          if (key.includes(this.postMatchKeywords[j])) shouldAdd = true
        }
        if (shouldAdd) arr.push({ [key]: normalize(value) })
        i = endIndex - 1
      }
    }
    if (typeof filter === 'object') {
      for (const key of Object.keys(filter)) {
        let shouldAdd = false
        for (let j = 0; j < this.postMatchKeywords.length; j++) {
          if (shouldAdd) break
          if (key.includes(this.postMatchKeywords[j])) shouldAdd = true
        }
        if (shouldAdd) arr.push({ [key]: normalize(filter[key]) })
      }
    }

    if (arr.length > 0) opt.$and = arr
    else return false
    builder.match(opt)
    this.logger.trace({ func: 'computePostQuery', meta: { filter } }, 'ended')
    return builder
  }

  computeSort (sort?: string): AggregateBuilder | false {
    this.logger.trace({ func: 'computeSort', meta: { sort } }, 'started')
    if (typeof sort === 'string') {
      const opt: SortPipeline = {}
      const builder = new AggregateBuilder()
      for (const o of sort.split(',')) {
        const orderKey = o.startsWith('-') ? '-' : '+'
        const key = o.replace(orderKey, '').trim()
        const order = orderKey === '-' ? -1 : 1
        // prevent empty key
        if (isExist(key)) opt[key] = order
      }
      builder.sort(opt)
      this.logger.trace({ func: 'computeSort', meta: { sort } }, 'ended')
      return builder
    } else {
      this.logger.trace({ func: 'computeSort', meta: { sort } }, 'ended')
      return false
    }
  }

  computeOption (page?: number, pageSize?: number): AggregateBuilder | false {
    this.logger.trace({ func: 'computeOption', meta: { page, pageSize } }, 'started')
    if (typeof page !== 'undefined' && typeof pageSize !== 'undefined') {
      const builder = new AggregateBuilder()
      const skip = page > 0 ? (page - 1) * pageSize : 0
      builder.limit(pageSize + skip)
      builder.skip(skip)
      this.logger.trace({ func: 'computeOption', meta: { page, pageSize } }, 'ended')
      return builder
    } else {
      this.logger.trace({ func: 'computeOption', meta: { page, pageSize } }, 'ended')
      return false
    }
  }

  computePipeline (options: SearchOptions = {}): AggregateBuilder {
    this.logger.trace({ func: 'computePipeline', meta: options }, 'started')
    const builder = this.computePreQuery(options)
    builder.concat(this.buildAggregateBuilder(options))
    const q = this.computePostQuery(options)
    if (q !== false) builder.concat(q)
    const s = this.computeSort(options?.sort)
    if (s !== false) builder.concat(s)
    const p = this.computeOption(options?.page, options?.pageSize)
    if (p !== false) builder.concat(p)
    this.logger.trace({ func: 'computePipeline', meta: options }, 'ended')
    return builder
  }

  buildAggregateBuilder (_options: SearchOptions): AggregateBuilder {
    return new AggregateBuilder()
  }

  async resetDatabase (): Promise<boolean> {
    this.logger.trace({ func: 'resetDatabase' }, 'started')
    await this.emit('pre-reset')
    try {
      await this.collection.drop()
    } catch (err: any) {
      // we only ignore the error when it throw by non-existance collection
      if (err.message === 'ns not found') {
        this.logger.trace({ func: 'resetDatabase' }, 'remove non-existance collection.')
      } else {
        throw err
      }
    }
    if (!this[kSkipIndex]) await this[kCreateIndex]()
    await this.emit('post-reset')
    this.logger.trace({ func: 'resetDatabase' }, 'ended')
    return true
  }
}

export interface Controller<TSchema extends Document = Document> extends EventEmitter {
  on (eventName: 'initialized', listener: () => void | Promise<void>): this
  on (eventName: 'pre-count', listener: (options: Pick<SearchOptions, 'search' | 'filter'>) => void | Promise<void>): this
  on (eventName: 'post-count', listener: (result: number, options: Pick<SearchOptions, 'search' | 'filter'>) => void | Promise<void>): this
  on (eventName: 'pre-search', listener: (options: SearchOptions) => void | Promise<void>): this
  on (eventName: 'post-search', listener: <U = TSchema>(result: U[], options: SearchOptions) => void | Promise<void>): this
  on (eventName: 'pre-insert', listener: (docs: TSchema | TSchema[]) => void | Promise<void>): this
  on (eventName: 'pre-insert-one', listener: (docs: TSchema, options?: InsertOneOptions) => void | Promise<void>): this
  on (eventName: 'post-insert-one', listener: (result: TSchema | null, docs: TSchema, options?: InsertOneOptions) => void | Promise<void>): this
  on (eventName: 'pre-insert-many', listener: (docs: TSchema[], options?: BulkWriteOptions) => void | Promise<void>): this
  on (eventName: 'post-insert-many', listener: (result: TSchema[], docs: TSchema[], options?: BulkWriteOptions) => void | Promise<void>): this
  on (eventName: 'post-insert', listener: () => void | Promise<void>): this
  on (eventName: 'pre-find', listener: (filter?: Filter<TSchema>, options?: FindOptions<TSchema>) => void | Promise<void>): this
  on (eventName: 'post-find', listener: (result: TSchema[], filter?: Filter<TSchema>, options?: FindOptions<TSchema>) => void | Promise<void>): this
  on (eventName: 'pre-find-one', listener: (filter?: Filter<TSchema>, options?: FindOptions<TSchema>) => void | Promise<void>): this
  on (eventName: 'post-find-one', listener: (result: TSchema | null, filter?: Filter<TSchema>, options?: FindOptions<TSchema>) => void | Promise<void>): this
  on (eventName: 'pre-find-by-id', listener: (id: string, options?: FindOptions<TSchema>) => void | Promise<void>): this
  on (eventName: 'post-find-by-id', listener: (result: TSchema | null, id: string, options?: FindOptions<TSchema>) => void | Promise<void>): this
  on (eventName: 'pre-update', listener: (filter: Filter<TSchema>, docs: UpdateFilter<TSchema> | Partial<TSchema>) => void | Promise<void>): this
  on (eventName: 'pre-update-one', listener: (filter: Filter<TSchema>, docs: UpdateFilter<TSchema> | Partial<TSchema>, options?: FindOneAndUpdateOptions) => void | Promise<void>): this
  on (eventName: 'post-update-one', listener: (result: TSchema | null, filter: Filter<TSchema>, docs: UpdateFilter<TSchema> | Partial<TSchema>, options?: FindOneAndUpdateOptions) => void | Promise<void>): this
  on (eventName: 'pre-update-many', listener: (filter: Filter<TSchema>, docs: UpdateFilter<TSchema> | Partial<TSchema>, options?: UpdateOptions) => void | Promise<void>): this
  on (eventName: 'post-update-many', listener: (result: TSchema[], filter: Filter<TSchema>, docs: UpdateFilter<TSchema> | Partial<TSchema>, options?: UpdateOptions) => void | Promise<void>): this
  on (eventName: 'pre-update-by-id', listener: (id: string, docs: UpdateFilter<TSchema> | Partial<TSchema>, options?: FindOneAndUpdateOptions) => void | Promise<void>): this
  on (eventName: 'post-update-by-id', listener: (result: TSchema | null, id: string, docs: UpdateFilter<TSchema> | Partial<TSchema>, options?: FindOneAndUpdateOptions) => void | Promise<void>): this
  on (eventName: 'post-update', listener: () => void | Promise<void>): this
  on (eventName: 'pre-delete', listener: (filter: Filter<TSchema>, docs: UpdateFilter<TSchema> | Partial<TSchema>) => void | Promise<void>): this
  on (eventName: 'pre-delete-one', listener: (filter: Filter<TSchema>, options?: FindOneAndDeleteOptions) => void | Promise<void>): this
  on (eventName: 'post-delete-one', listener: (result: TSchema | null, filter: Filter<TSchema>, options?: FindOneAndDeleteOptions) => void | Promise<void>): this
  on (eventName: 'pre-delete-many', listener: (filter?: Filter<TSchema>, options?: DeleteOptions) => void | Promise<void>): this
  on (eventName: 'post-delete-many', listener: (result: TSchema[], filter?: Filter<TSchema>, options?: DeleteOptions) => void | Promise<void>): this
  on (eventName: 'pre-delete-by-id', listener: (id: string, options?: FindOneAndDeleteOptions) => void | Promise<void>): this
  on (eventName: 'post-delete-by-id', listener: (result: TSchema | null, id: string, options?: FindOneAndDeleteOptions) => void | Promise<void>): this
  on (eventName: 'post-delete', listener: () => void | Promise<void>): this
  on (eventName: 'pre-reset', listener: () => void | Promise<void>): this
  on (eventName: 'post-reset', listener: () => void | Promise<void>): this
}
