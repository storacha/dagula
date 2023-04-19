import { multiaddr } from '@multiformats/multiaddr'
import debug from 'debug'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import * as dagPb from '@ipld/dag-pb'
import * as dagCbor from '@ipld/dag-cbor'
import * as dagJson from '@ipld/dag-json'
import * as Block from 'multiformats/block'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { exporter, walkPath } from 'ipfs-unixfs-exporter'
import { transform } from 'streaming-iterables'
import { BitswapFetcher } from './bitswap-fetcher.js'

/**
 * @typedef {import('./index').Blockstore} Blockstore
 * @typedef {import('./index').BlockDecoders} BlockDecoders
 * @typedef {import('./index').Block} Block
 */

const BITSWAP_PROTOCOL = '/ipfs/bitswap/1.2.0'
const DEFAULT_PEER = multiaddr('/dns4/elastic.dag.house/tcp/443/wss/p2p/bafzbeibhqavlasjc7dvbiopygwncnrtvjd2xmryk5laib7zyjor6kf3avm')

const log = debug('dagula')

/** @type {BlockDecoders} */
const Decoders = {
  [raw.code]: raw,
  [dagPb.code]: dagPb,
  [dagCbor.code]: dagCbor,
  [dagJson.code]: dagJson
}

export class Dagula {
  /** @type {Blockstore} */
  #blockstore

  /** @type {BlockDecoders} */
  #decoders

  /**
   * @param {Blockstore} blockstore
   * @param {{ decoders?: BlockDecoders }} [options]
   */
  constructor (blockstore, options = {}) {
    this.#blockstore = blockstore
    this.#decoders = options.decoders || Decoders
  }

  /**
   * @param {import('./index').Network} network
   * @param {{ decoders?: BlockDecoders, peer?: import('@multiformats/multiaddr').Multiaddr }} [options]
   */
  static async fromNetwork (network, options = {}) {
    const peer = (typeof options.peer === 'string' ? multiaddr(options.peer) : options.peer) || DEFAULT_PEER
    const bitswap = new BitswapFetcher(async () => {
      log('new stream to %s', peer)
      // @ts-ignore
      const stream = await network.dialProtocol(peer, BITSWAP_PROTOCOL, { lazy: true })
      return stream
    })

    // incoming blocks
    await network.handle(BITSWAP_PROTOCOL, bitswap.handler)

    return new Dagula(bitswap, options)
  }

  /**
   * @param {CID[]|CID|string} cid
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @param {(block: import('multiformats').BlockView) => CID[]} [options.search]
   */
  async * get (cid, options = {}) {
    cid = typeof cid === 'string' ? CID.parse(cid) : cid
    log('getting DAG %s', cid)
    let cids = Array.isArray(cid) ? cid : [cid]
    const search = options.search || breadthFirstSearch()
    while (cids.length > 0) {
      log('fetching %d CIDs', cids.length)
      const fetchBlocks = transform(cids.length, async cid => {
        return this.getBlock(cid, { signal: options.signal })
      })
      let nextCids = []
      for await (const { cid, bytes } of fetchBlocks(cids)) {
        const decoder = this.#decoders[cid.code]
        if (!decoder) {
          yield { cid, bytes }
          throw new Error(`unknown codec: ${cid.code}`)
        }
        log('decoding block %s', cid)
        const block = await Block.decode({ bytes, codec: decoder, hasher })
        yield block
        nextCids = nextCids.concat(search(block))
      }
      log('%d CIDs in links', nextCids.length)
      cids = nextCids
    }
  }

  /**
   * @param {string} cidPath
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @param {'all'|'file'|'block'} [options.carScope] control how many layers of the dag are returned
   *    'all': return the entire dag starting at path. (default)
   *    'block': return the block identified by the path.
   *    'file': Mimic gateway semantics: Return All blocks for a multi-block file or just enough blocks to enumerate a dir/map but not the dir contents.
   *     e.g. Where path points to a single block file, all three selectors would return the same thing.
   *     e.g. where path points to a sharded hamt: 'file' returns the blocks of the hamt so the dir can be listed. 'block' returns the root block of the hamt.
   */
  async * getPath (cidPath, options = {}) {
    const carScope = options.carScope ?? 'all'
    /** @type {import('ipfs-unixfs-exporter').UnixFSEntry} */
    let base
    for await (const item of this.walkUnixfsPath(cidPath, { signal: options.signal })) {
      base = item
      yield item
    }
    if (carScope === 'all' || (carScope === 'file' && base.type !== 'directory')) {
    // fetch the entire dag rooted at the end of the provided path
      const links = base.node.Links?.map(l => l.Hash) || []
      if (links.length) {
        yield * this.get(links, { signal: options.signal })
      }
    }
    // non-files, like directories, and IPLD Maps only return blocks necessary for their enumeration
    if (carScope === 'file' && base.type === 'directory') {
      // the single block for the root has already been yielded.
      // For a hamt we must fetch all the blocks of the (current) hamt.
      if (base.unixfs.type === 'hamt-sharded-directory') {
        yield * this.get(base.cid, { search: hamtSearch, signal: options.signal })
      }
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
   * @param {string} cidPath
   * @param {{ signal?: AbortSignal }} [options]
   */
  async * walkUnixfsPath (cidPath, options = {}) {
    log('walking unixfs %s', cidPath)
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
    for await (const entry of walkPath(cidPath, blockstore, { signal: options.signal })) {
      /** @type {Uint8Array} */
      const bytes = entry.node.Links ? dagPb.encode(entry.node) : entry.node
      yield { ...entry, bytes }
    }
  }
}

/**
 *
 */
export function breadthFirstSearch (linkFilter = () => true) {
  /**
   * @param {import('multiformats').BlockView} block
   */
  return function (block) {
    const nextCids = []
    for (const link of block.links()) {
      if (linkFilter(link)) {
        nextCids.push(link[1])
      }
    }
    return nextCids
  }
}

export const hamtSearch = breadthFirstSearch(([name]) => name.length === 2)
