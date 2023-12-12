/* eslint-disable @typescript-eslint/method-signature-style */
import DeepMerge from '@fastify/deepmerge'
import AggregateBuilder from '@kakang/mongodb-aggregate-builder'
import { isEmpty, isExist, isNull, isUndefined } from '@kakang/validator'
import { type AggregateOptions, type AnyBulkWriteOperation, type BulkWriteOptions, type Collection, type Document, type Filter, type FindOptions, type UpdateFilter } from 'mongodb'
import { appendBasicSchema, appendUpdateSchema } from '../utils/append'
import { computeSharedOption } from '../utils/option'
import { normalizeQueryDate, retrieveUpdateQueryData } from '../utils/query'
import { Controller, type ControllerOptions, type SearchOptions } from './default'
const deepmerge = DeepMerge()

export interface MultiLanguageControllerOptions<TSchema extends Document = Document> extends Partial<ControllerOptions> {
  slugField: keyof TSchema
  commonFields?: Array<keyof TSchema>
}

export interface MultiLanguageSearchOptions extends SearchOptions {
  language?: string
}

export class MultiLanguageController<TSchema extends Document = Document> extends Controller<TSchema> {
  slugField: keyof TSchema
  commonFields: Array<keyof TSchema>

  constructor (collection: Collection | undefined, options: MultiLanguageControllerOptions<TSchema>) {
    // slug field must be an index
    // it can greatly increase the searching time
    options.indexes = options.indexes ?? []
    options.indexes.push({ indexSpec: { [options.slugField]: 1 } })
    super(collection, options)
    this.slugField = options.slugField
    this.commonFields = options?.commonFields ?? []
  }

  async findOneByLanguage (language: string, filter?: Filter<TSchema>, options?: FindOptions<TSchema>): Promise<{ isFallback: boolean, item: TSchema | null }> {
    this.logger.debug({ func: 'findOneByLanguage', meta: { language, filter, options } }, 'started')
    filter ??= {}
    let isFallback = false
    let item = await this.collection.findOne({ ...filter, language }, options)
    if (isEmpty(item)) {
      item = await this.collection.findOne(filter, options)
      isFallback = isExist(item)
    }
    this.logger.debug({ func: 'findOneByLanguage', meta: { language, filter, options } }, 'ended')
    return { isFallback, item }
  }

  async updateOneByLanguage (language: string, filter: Filter<TSchema>, docs: UpdateFilter<TSchema> | Partial<TSchema>, options?: BulkWriteOptions): Promise<{ isFallback: boolean, item: TSchema | null }> {
    this.logger.debug({ func: 'updateOneByLanguage', meta: { language, filter, docs, options } }, 'started')
    options ??= {}
    const sharedOptions = computeSharedOption(options)
    const { isFallback, item } = await this.findOneByLanguage(language, filter, sharedOptions)
    if (isEmpty(item)) return { isFallback, item: null }

    const commonDocs: Partial<TSchema> = {}
    const d = retrieveUpdateQueryData(docs)
    for (const field of this.commonFields) {
      // we should only set when data is not null or undefined
      if (!isNull(d[field]) && !isUndefined(d[field])) { commonDocs[field] = d[field] }
    }

    const operations: Array<AnyBulkWriteOperation<TSchema>> = []

    // update common fields
    operations.push({ updateMany: { filter: { [this.slugField]: item[this.slugField] } as any, update: { $set: commonDocs as any } } })

    // insert when it is fallback, update when item exist
    if (isFallback) {
      // we need to merge the old and new document to prevent missing fields
      const doc: any = deepmerge(item, retrieveUpdateQueryData(docs))
      // we append needed info for the document
      const document: any = appendBasicSchema(doc as TSchema, this.appendBasicSchema)
      // ensure slug is exist
      document[this.slugField] = item[this.slugField]
      // insert if language is not exist
      operations.push({ insertOne: { document } })
    } else {
      // ensure it is atomic operation
      const doc: any = appendUpdateSchema(retrieveUpdateQueryData(docs), this.appendBasicSchema)
      // update if language is exist
      operations.push({ updateOne: { filter: { ...filter, language }, update: normalizeQueryDate(doc as UpdateFilter<TSchema>) } })
    }

    // perform all operations in once
    await this.collection.bulkWrite(operations, options)

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const result = await this.findOneByLanguage(language, { [this.slugField]: item[this.slugField] } as Filter<TSchema>, sharedOptions)
    this.logger.debug({ func: 'updateOneByLanguage', meta: { language, filter, docs, options } }, 'ended')
    return result
  }

  buildAggregateBuilder (options: MultiLanguageSearchOptions): AggregateBuilder {
    const builder = new AggregateBuilder()
    // we group by common field after the first match filter
    builder.group({
      _id: `$${this.slugField as string}`
    })
    // we fetch all the language
    builder.lookup({
      from: this.collectionName,
      localField: '_id',
      foreignField: this.slugField as string,
      as: 'items'
    })
    // we find if the items have matched language
    builder.addFields({
      index: {
        $indexOfArray: ['$items.language', options.language]
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

export interface MultiLanguageController<TSchema extends Document = Document> extends Controller<TSchema> {
  search<U = TSchema> (options?: MultiLanguageSearchOptions, o?: AggregateOptions): Promise<U[]>
}
