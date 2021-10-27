import AggregateBuilder, { MatchPipeline } from '@kakang/mongodb-aggregate-builder'
import * as Validator from '@kakang/validator'
import { Collection, Document, Filter, FindOptions } from 'mongodb'
import { kCreateIndex, kFindNextPair, kNormalizeFilter, kTransformRegExpSearch } from '../constant'
import { Controller, ControllerOptions } from './default'

export interface MultiLanguageControllerOptions extends ControllerOptions {
  commonField: string
}

export class MultiLanguageController<TSchema extends Document = Document> extends Controller<TSchema> {
  commonField: string

  constructor (collection: Collection | undefined, options: MultiLanguageControllerOptions) {
    super(collection, options)
    this.commonField = options.commonField
  }

  [kCreateIndex] (): void {
    super[kCreateIndex]()
    this.collection.createIndex({ [this.commonField]: 1 }, () => {})
  }

  buildAggregateBuilder (): AggregateBuilder {
    const builder = new AggregateBuilder()
    builder.group({
      _id: `$${this.commonField}`,
      items: { $push: '$$ROOT' }
    })
    return builder
  }

  async search<U = TSchema>(search?: string, filter?: string, sort?: string, page?: number, pageSize?: number, language?: string): Promise<U[]> {
    this.logger.debug({ func: 'search' }, 'search for %s with %s sorted by %s at page %n with size %n %n - %s', search, filter, sort, page, pageSize, language)
    await this.emit('pre-search', search, filter, sort, page, pageSize)
    const pipeline = this.computePipeline(search, filter, sort, page, pageSize).toArray()
    const result = await this.collection.aggregate<{ _id: string, items: U[]}>(pipeline).toArray()
    await this.emit('post-search', result, search, filter, sort, page, pageSize)

    return result.map(function (i) {
      const item = i.items.find(function (o: any) { return o.language === language })
      return item ?? i.items.pop() as U
    })
  }

  async findOneWithFallback (language: string, filter: Filter<TSchema>, options?: FindOptions<any>): Promise<{ isFallback: boolean, item: TSchema | null}> {
    let isFallback = false
    let item = await this.findOne({ ...filter, language }, options)
    // fallback to first created item
    if (!Validator.isExist(item)) {
      item = await this.findOne(filter, { sort: { createdAt: -1 } })
      isFallback = true
    }
    return { isFallback, item }
  }

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
        sub.push({ [`items.${fields}`]: normalize(search) })
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

  computeSort (sort: string): AggregateBuilder | false {
    this.logger.trace({ func: 'computeQuery', sort }, 'compute sort')
    if (typeof sort === 'string') {
      const opt: Record<string, 1 | -1> = {}
      const builder = new AggregateBuilder()
      if (sort.endsWith(',')) sort = sort.substr(0, sort.length - 1)
      sort.split(',').forEach(function (o) {
        const orderKey = o.startsWith('-') ? '-' : '+'
        const key = o.replace(orderKey, '').trim()
        const order = orderKey === '-' ? -1 : 1
        // prevent empty key
        if (Validator.isExist(key)) opt[`items.${key}`] = order
      })
      builder.sort(opt)
      return builder
    } else {
      return false
    }
  }
}
