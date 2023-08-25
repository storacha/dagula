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
  test(testCase.name, async t => {
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
