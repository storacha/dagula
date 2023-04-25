import debug from 'debug'
import { CID } from 'multiformats/cid'
import * as Block from 'multiformats/block'
import { exporter, walkPath } from 'ipfs-unixfs-exporter'
import { transform } from 'streaming-iterables'
import { Decoders, Hashers } from './defaults.js'

const log = debug('dagula')

export class Dagula {
  /** @type {import('./index').Blockstore} */
  #blockstore
  /** @type {import('./index').BlockDecoders} */
  #decoders
  /** @type {import('./index').MultihashHashers} */
  #hashers

  /**
   * @param {import('./index').Blockstore} blockstore
   * @param {{
   *   decoders?: import('./index').BlockDecoders,
   *   hashers?: import('./index').MultihashHashers
   * }} [options]
   */
  constructor (blockstore, options = {}) {
    this.#blockstore = blockstore
    this.#decoders = options.decoders || Decoders
    this.#hashers = options.hashers || Hashers
  }

  /**
   * @param {import('multiformats').CID|string} cid
   * @param {{ signal?: AbortSignal }} [options]
   */
  async * get (cid, options = {}) {
    cid = typeof cid === 'string' ? CID.parse(cid) : cid
    log('getting DAG %s', cid)

    /** @type {AbortController[]} */
    let aborters = []
    const { signal } = options
    signal?.addEventListener('abort', () => aborters.forEach(a => a.abort(signal.reason)))

    let cids = [cid]
    while (true) {
      log('fetching %d CIDs', cids.length)
      const fetchBlocks = transform(cids.length, async cid => {
        if (signal) {
          const aborter = new AbortController()
          aborters.push(aborter)
          const block = await this.getBlock(cid, { signal: aborter.signal })
          aborters = aborters.filter(a => a !== aborter)
          return block
        }
        return this.getBlock(cid)
      })
      const nextCids = []
      for await (const { cid, bytes } of fetchBlocks(cids)) {
        const decoder = this.#decoders[cid.code]
        if (!decoder) {
          yield { cid, bytes }
          throw new Error(`unknown codec: ${cid.code}`)
        }
        const hasher = this.#hashers[cid.multihash.code]
        if (!hasher) {
          yield { cid, bytes }
          throw new Error(`unknown multihash codec: ${cid.multihash.code}`)
        }
        log('decoding block %s', cid)
        // bitswap-fetcher _must_ verify hashes on receipt of a block, but we
        // cannot guarantee the blockstore passed is a bitswap so cannot use
        // createUnsafe here.
        const block = await Block.create({ bytes, cid, codec: decoder, hasher })
        yield block
        for (const [, cid] of block.links()) {
          nextCids.push(cid)
        }
      }
      if (!nextCids.length) break
      log('%d CIDs in links', nextCids.length)
      cids = nextCids
    }
  }

  /**
   * @param {import('multiformats').CID|string} cid
   * @param {{ signal?: AbortSignal }} [options]
   */
  async getBlock (cid, options = {}) {
    cid = typeof cid === 'string' ? CID.parse(cid) : cid
    log('getting block %s', cid)
    const block = await this.#blockstore.get(cid, { signal: options.signal })
    if (!block) {
      throw Object.assign(new Error(`peer does not have: ${cid}`), { code: 'ERR_DONT_HAVE' })
    }
    return block
  }

  /**
   * @param {string|import('multiformats').CID} path
   * @param {{ signal?: AbortSignal }} [options]
   */
  async getUnixfs (path, options = {}) {
    log('getting unixfs %s', path)
    const blockstore = {
      /**
       * @param {CID} cid
       * @param {{ signal?: AbortSignal }} [options]
       */
      get: async (cid, options) => {
        const block = await this.getBlock(cid, options)
        return block.bytes
      }
    }
    // @ts-ignore exporter requires Blockstore but only uses `get`
    return exporter(path, blockstore, { signal: options.signal })
  }

  /**
   * @param {string|import('multiformats').CID} path
   * @param {{ signal?: AbortSignal }} [options]
   */
  async * walkUnixfsPath (path, options = {}) {
    log('walking unixfs %s', path)
    const blockstore = {
      /**
       * @param {CID} cid
       * @param {{ signal?: AbortSignal }} [options]
       */
      get: async (cid, options) => {
        const block = await this.getBlock(cid, options)
        return block.bytes
      }
    }

    // @ts-ignore exporter requires Blockstore but only uses `get`
    yield * walkPath(path, blockstore, { signal: options.signal })
  }
}
