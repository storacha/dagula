import anyTest from 'ava'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { CARReaderStream } from 'carstream'
import * as Testmark from 'testmark.js'
import * as Link from 'multiformats/link'
import { MemoryBlockstore } from './helpers/blockstore.js'
import { Dagula } from '../index.js'

const test = /** @type {import('ava').TestFn<{ dagula: import('../index.js').IDagula }>} */ (anyTest)
const doc = Testmark.parse(fs.readFileSync('./test/fixtures/unixfs_20m_variety.md', 'utf8'))

test.before(async t => {
  const blockstore = new MemoryBlockstore()
  const car = /** @type {ReadableStream<Uint8Array>} */
    (Readable.toWeb(fs.createReadStream('./test/fixtures/unixfs_20m_variety.car')))
  await car
    .pipeThrough(new CARReaderStream())
    .pipeTo(new WritableStream({ write: block => blockstore.put(block.cid, block.bytes) }))
  t.context.dagula = new Dagula(blockstore)
})

/**
 * @param {string} body
 * @returns {{ cidPath: string, options: import('../index').DagScopeOptions & import('../index').EntityBytesOptions }}
 */
const parseQueryBody = body => {
  const url = new URL(body, 'http://localhost')
  /** @type {import('../index').DagScopeOptions & import('../index').EntityBytesOptions} */
  // @ts-expect-error
  const options = { dagScope: url.searchParams.get('dag-scope') ?? undefined }
  const entityBytesstr = url.searchParams.get('entity-bytes')
  if (entityBytesstr) {
    const [from, to] = entityBytesstr.split(':')
    options.entityBytes = { from: parseInt(from), to: to === '*' ? to : parseInt(to) }
  }
  return { cidPath: url.pathname.replace('/ipfs/', ''), options }
}

/** @param {string} body */
const parseExecutionBody = body => body.split('\n').filter(Boolean).map(line => {
  const parts = line.split(' | ').map(s => s.trimEnd())
  return { cid: Link.parse(parts[0]), type: parts[1], description: parts[2] }
})

for (const queryHunk of doc.dataHunks) {
  if (!queryHunk.name.endsWith('/query')) continue

  test(queryHunk.name.replace('test/', '').replace('/query', ''), async t => {
    const { cidPath, options } = parseQueryBody(queryHunk.body)
    const blocks = []
    const iterator = t.context.dagula.getPath(cidPath, options)
    for await (const block of iterator) {
      blocks.push(block)
    }

    const executionHunkName = queryHunk.name.replace('/query', '/execution')
    const executionHunk = doc.hunksByName.get(executionHunkName)
    if (!executionHunk) {
      throw new Error(`execution hunk not found: ${executionHunkName}`)
    }

    for (const [i, { cid }] of parseExecutionBody(executionHunk.body).entries()) {
      const block = blocks[i]
      t.assert(block)
      t.is(block.cid.toString(), cid.toString())
    }
  })
}
