import anyTest from 'ava'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { CARReaderStream } from 'carstream'
// @ts-expect-error
import { unixfs20mVarietyCases, unixfs20mVarietyCar } from '@ipld/specs/trustless-pathing/unixfs_20m_variety'
import { MemoryBlockstore } from './helpers/blockstore.js'
import { Dagula } from '../index.js'

/** @typedef {{ name: string, expectedCids: import('multiformats').Link[], asQuery: () => string }} TestCase */

const test = /** @type {import('ava').TestFn<{ dagula: import('../index.js').IDagula }>} */ (anyTest)

// https://github.com/ipld/ipld/pull/296#issuecomment-1691532242
const skips = [
  'sharded_file_in_hamt_in_directory/all',
  'sharded_file_in_hamt_in_directory/entity',
  'sharded_file_in_hamt_in_directory/block',
  'sharded_file_in_directory_in_hamt_in_directory/all',
  'sharded_file_in_directory_in_hamt_in_directory/entity',
  'sharded_file_in_directory_in_hamt_in_directory/block',
  'small_file_in_directory_byte_ranges/0:*',
  'small_file_in_directory_byte_ranges/0:0',
  'small_file_in_directory_byte_ranges/0:10',
  'small_file_in_directory_byte_ranges/1822:1823',
  'small_file_in_directory_byte_ranges/1823:1823',
  'small_file_in_directory_byte_ranges/1823:*',
  'small_file_in_directory_byte_ranges/0:-10',
  'small_file_in_directory_byte_ranges/-1823:*',
  'small_file_in_directory_byte_ranges/-1823:-1822',
  'small_file_in_directory_in_hamt_in_directory/all',
  'small_file_in_directory_in_hamt_in_directory/entity',
  'small_file_in_directory_in_hamt_in_directory/block',
  'hamt_in_directory/entity',
  'hamt_in_directory_with_byte_range/entity'
]

/** @param {string} query */
const parseQuery = query => {
  const url = new URL(query, 'http://localhost')
  /** @type {import('../index').DagScopeOptions & import('../index').EntityBytesOptions} */
  // @ts-expect-error
  const options = { dagScope: url.searchParams.get('dag-scope') ?? undefined }
  const entityBytes = url.searchParams.get('entity-bytes')
  if (entityBytes && entityBytes !== 'null') {
    const [from, to] = entityBytes.split(':')
    options.entityBytes = { from: parseInt(from), to: to === '*' ? to : parseInt(to) }
  }
  const cidPath = url.pathname.replace('/ipfs/', '').split('/').map(decodeURIComponent).join('/')
  return { cidPath, options }
}

test.before(async t => {
  const blockstore = new MemoryBlockstore()
  const car = /** @type {ReadableStream<Uint8Array>} */
    (Readable.toWeb(fs.createReadStream(unixfs20mVarietyCar())))
  await car
    .pipeThrough(new CARReaderStream())
    .pipeTo(new WritableStream({ write: block => blockstore.put(block.cid, block.bytes) }))
  t.context.dagula = new Dagula(blockstore)
})

/** @type {TestCase[]} */
const cases = unixfs20mVarietyCases()

for (const testCase of cases) {
  const isSkip = skips.some(s => s === testCase.name)
  const testFn = isSkip ? test.skip : test

  testFn(testCase.name, async t => {
    t.log(testCase.asQuery())
    const { cidPath, options } = parseQuery(testCase.asQuery())
    const blocks = []
    const iterator = t.context.dagula.getPath(cidPath, options)
    for await (const block of iterator) {
      blocks.push(block)
    }

    t.is(blocks.length, testCase.expectedCids.length)
    for (const [i, cid] of testCase.expectedCids.entries()) {
      const block = blocks[i]
      t.assert(block)
      t.is(block.cid.toString(), cid.toString())
    }
  })
}
