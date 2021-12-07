import AggregateBuilder from '@kakang/mongodb-aggregate-builder'
import { isEmpty, isExist } from '@kakang/validator'
import { Collection, Filter, FindOptions, UpdateFilter, UpdateOptions } from 'mongodb'
import { retrieveUpdateQueryData } from '../utils/query'
import { Controller, ControllerOptions } from './default'

export interface MultiLanguageControllerOptions extends Partial<ControllerOptions> {
  slugField: string
  commonFields?: string[]
}

export class MultiLanguageController<TSchema extends Document = Document> extends Controller<TSchema> {
  slugField: string
  commonFields: string[]

  constructor (collection: Collection| undefined, options: MultiLanguageControllerOptions) {
    // common fields must be an index
    // it can greatly increase the searching time
    options.indexes = options.indexes ?? []
    options.indexes.push({ indexSpec: { [options.slugField]: 1 } })
    super(collection, options)
    this.slugField = options.slugField
    this.commonFields = options?.commonFields ?? []
  }

  async search<U = TSchema> (search?: string | Record<string, unknown>, filter?: string | Record<string, unknown>, sort?: string, page?: number, pageSize?: number, language?: string): Promise<U[]> {
    await this.emit('pre-search', search, filter, sort, page, pageSize)
    const pipeline = this.computePipeline(search, filter, sort, page, pageSize, language).toArray()
    const result = await this.collection.aggregate<U>(pipeline).toArray()
    await this.emit('post-search', result, search, filter, sort, page, pageSize)
    return result
  }

  async findOneByLanguage (language: string, filter?: Filter<TSchema>, options?: FindOptions<TSchema>): Promise<{ isFallback: boolean, item: TSchema | null }> {
    filter = filter ?? {}
    let isFallback = false
    let item = await this.collection.findOne({ ...filter, language }, options)
    if (isEmpty(item)) {
      item = await this.collection.findOne(filter, options)
      isFallback = isExist(item)
    }
    return { isFallback, item }
  }

  async updateOneByLanguage (language: string, filter: Filter<TSchema>, docs: UpdateFilter<TSchema> | Partial<TSchema>, options?: UpdateOptions): Promise<{ isFallback: boolean, item: TSchema | null }> {
    const { isFallback, item } = await this.findOneByLanguage(language, filter)
    if (isEmpty(item)) return { isFallback, item: null }

    // update common fields
    await this.collection.updateMany({ [this.slugField]: item[this.slugField] } as any, {})

    // insert when it is fallback, update when item exist
    if (isFallback) {
      // ensure slug is exist
      const o: any = retrieveUpdateQueryData(docs)
      o[this.slugField] = item[this.slugField]
      // insert if language is not exist
      await this.insertOne(o)
    } else {
      // update if language is exist
      await this.updateOne({ ...filter, language }, docs)
    }

    return await this.findOneByLanguage(language, filter)
  }

  computePipeline (search?: string | Record<string, unknown>, filter?: string | Record<string, unknown>, sort?: string, page?: number, pageSize?: number, language?: string): AggregateBuilder {
    this.logger.trace({ func: 'computePipeline', search, filter, sort, page, pageSize }, 'compute pipeline')
    const builder = this.computePreQuery(search, filter)
    builder.concat(this.buildAggregateBuilder(language))
    const s = this.computeSort(sort)
    if (s !== false) builder.concat(s)
    const p = this.computeOption(page, pageSize)
    if (p !== false) builder.concat(p)
    const q = this.computePostQuery(filter)
    if (q !== false) builder.concat(q)
    return builder
  }

  buildAggregateBuilder (language?: string): AggregateBuilder {
    const builder = new AggregateBuilder()
    // we group by common field after the first match filter
    builder.group({
      _id: `$${this.slugField}`
    })
    // we fetch all the language
    builder.lookup({
      from: this.collectionName,
      localField: '_id',
      foreignField: this.slugField,
      as: 'items'
    })
    // we find if the items have matched language
    builder.addFields({
      index: {
        $indexOfArray: ['$items.language', language]
      }
    })
    // we use the first doc if language not match
    builder.replaceRoot({
      newRoot: {
        $cond: {
          if: { $ne: ['$index', -1] },
          then: { $arrayElemAt: ['$items', '$index'] },
          else: { $first: '$items' }
        }
      }
    })
    return builder
  }
}
