import debug from 'debug'
import { CID } from 'multiformats/cid'
import * as dagPB from '@ipld/dag-pb'
import * as Block from 'multiformats/block'
import { exporter, walkPath } from 'ipfs-unixfs-exporter'
import { parallelMap, transform } from 'streaming-iterables'
import { Decoders, Hashers } from './defaults.js'
import { identity } from 'multiformats/hashes/identity'

/** @typedef {([name, cid]: [string, import('multiformats').UnknownLink]) => boolean} LinkFilter */

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
   * @param {import('multiformats').UnknownLink[]|import('multiformats').UnknownLink|string} cid
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @param {import('./index').BlockOrder} [options.order]
   * @param {LinkFilter} [options.filter]
   */
  async * get (cid, options = {}) {
    cid = typeof cid === 'string' ? CID.parse(cid) : cid
    const order = options.order ?? 'dfs'
    log('getting DAG %s', cid)
    let cids = Array.isArray(cid) ? cid : [cid]
    const getLinks = blockLinks(options.filter)

    /** @type {AbortController[]} */
    let aborters = []
    const { signal } = options
    signal?.addEventListener('abort', () => aborters.forEach(a => a.abort(signal.reason)))

    while (cids.length > 0) {
      log('fetching %d CIDs', cids.length)
      const parallelFn = order === 'dfs' ? parallelMap : transform
      const fetchBlocks = parallelFn(cids.length, async cid => {
        if (signal) {
          const aborter = new AbortController()
          aborters.push(aborter)
          const block = await this.getBlock(cid, { signal: aborter.signal })
          aborters = aborters.filter(a => a !== aborter)
          return block
        }
        return this.getBlock(cid)
      })
      let nextCids = []
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
        const blockCids = getLinks(block)
        if (order === 'dfs') {
          yield * this.get(blockCids, options)
        } else {
          nextCids = nextCids.concat(blockCids)
        }
      }
      log('%d CIDs in links', nextCids.length)
      cids = nextCids
    }
  }

  /**
   * Yield all blocks traversed to resolve the ipfs path.
   * Then use dagScope to determine the set of blocks of the targeted dag to yield.
   * Yield all blocks by default.
   * Use dagScope: 'block' to yield the termimal block.
   * Use dagScope: 'entity' to yield all the blocks of a unixfs file, or enough blocks to list a directory.
   *
   * @param {string} cidPath
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @param {import('./index').BlockOrder} [options.order] Specify desired block ordering. `dfs` - Depth First Search, `unk` - unknown ordering.
   * @param {import('./index').DagScope} [options.dagScope] control how many layers of the dag are returned
   *    'all': return the entire dag starting at path. (default)
   *    'block': return the block identified by the path.
   *    'entity': Mimic gateway semantics: Return All blocks for a multi-block file or just enough blocks to enumerate a dir/map but not the dir contents.
   *     Where path points to a single block file, all three selectors would return the same thing.
   *     where path points to a sharded hamt: 'file' returns the blocks of the hamt so the dir can be listed. 'block' returns the root block of the hamt.
   */
  async * getPath (cidPath, options = {}) {
    const dagScope = options.dagScope ?? 'all'

    /**
     * The resolved dag root at the terminus of the cidPath
     * @type {import('ipfs-unixfs-exporter').UnixFSEntry?}
     */
    let base = null

    /**
     * Cache of blocks required to resove the cidPath
     * @type {import('./index').Block[]}
     */
    let traversed = []

    /**
     * Adapter for unixfs-exporter to track the blocks it loads as it resolves the path.
     * `walkPath` emits a single unixfs entry for multiblock structures, but we need the individual blocks.
     * TODO: port logic to @web3-storage/ipfs-path to make this less ugly.
     */
    const blockstore = {
      /**
       * @param {CID} cid
       * @param {{ signal?: AbortSignal }} [options]
       */
      get: async (cid, options) => {
        const block = await this.getBlock(cid, options)
        traversed.push(block)
        return block.bytes
      }
    }
    // @ts-expect-error walkPath wants blockstore with has and put
    for await (const item of walkPath(cidPath, blockstore, { signal: options.signal })) {
      base = item
      yield * traversed
      traversed = []
    }
    if (!base) throw new Error('walkPath did not yield an entry')

    if (dagScope === 'all' || (dagScope === 'entity' && base.type !== 'directory')) {
      const links = getLinks(base, this.#decoders)
      // fetch the entire dag rooted at the end of the provided path
      if (links.length) {
        yield * this.get(links, { signal: options.signal, order: options.order })
      }
    }
    // non-files, like directories, and IPLD Maps only return blocks necessary for their enumeration
    if (dagScope === 'entity' && base.type === 'directory') {
      // the single block for the root has already been yielded.
      // For a hamt we must fetch all the blocks of the (current) hamt.
      if (base.unixfs.type === 'hamt-sharded-directory') {
        const hamtLinks = base.node.Links?.filter(l => l.Name?.length === 2).map(l => l.Hash) || []
        if (hamtLinks.length) {
          yield * this.get(hamtLinks, { filter: hamtFilter, signal: options.signal, order: options.order })
        }
      }
    }
  }

  /**
   * @param {import('multiformats').UnknownLink|string} cid
   * @param {{ signal?: AbortSignal }} [options]
   */
  async getBlock (cid, options = {}) {
    cid = typeof cid === 'string' ? CID.parse(cid) : cid
    log('getting block %s', cid)
    if (cid.code === identity.code) {
      return { cid, bytes: cid.multihash.digest }
    }
    const block = await this.#blockstore.get(cid, { signal: options.signal })
    if (!block) {
      throw Object.assign(new Error(`peer does not have: ${cid}`), { code: 'ERR_DONT_HAVE' })
    }
    return block
  }

  /**
   * @param {string|import('multiformats').UnknownLink} path
   * @param {{ signal?: AbortSignal }} [options]
   */
  async getUnixfs (path, options = {}) {
    log('getting unixfs %s', path)
    const blockstore = {
      /**
       * @param {import('multiformats').UnknownLink} cid
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
       * @param {import('multiformats').UnknownLink} cid
       * @param {{ signal?: AbortSignal }} [options]
       */
      get: async (cid, options) => {
        const block = await this.getBlock(cid, options)
        return block.bytes
      }
    }
    // @ts-expect-error walkPath wants blockstore with has and put
    yield * walkPath(cidPath, blockstore, { signal: options.signal })
  }
}

/**
 * Create a search function that given a decoded Block
 * will return an array of CIDs to fetch next.
 *
 * @param {LinkFilter} linkFilter
 */
export function blockLinks (linkFilter = () => true) {
  /**
   * @param {import('multiformats').BlockView<any, any, any, import('multiformats').Version>} block
   */
  return function (block) {
    /** @type {import('multiformats').UnknownLink[]} */
    const nextCids = []
    if (block.cid.code === dagPB.code) {
      for (const { Name, Hash } of block.value.Links) {
        if (linkFilter([Name, Hash])) {
          nextCids.push(Hash)
        }
      }
    } else {
      // links() paths dagPb in the ipld style so name is e.g `Links/0/Hash`, and not what we want here.
      for (const link of block.links()) {
        if (linkFilter(link)) {
          nextCids.push(link[1])
        }
      }
    }
    return nextCids
  }
}

/** @type {LinkFilter} */
export const hamtFilter = ([name]) => name.length === 2

/**
 * Get links as array of CIDs for a UnixFS entry.
 * @param {import('ipfs-unixfs-exporter').UnixFSEntry} entry
 * @param {import('./index').BlockDecoders} decoders
 */
function getLinks (entry, decoders) {
  if (entry.type === 'file' || entry.type === 'directory') {
    return entry.node.Links.map(l => l.Hash)
  }

  if (entry.type === 'object' || entry.type === 'identity') {
    // UnixFSEntry `node` is Uint8Array for objects and identity blocks!
    // so we have to decode them again to get the links here.
    const decoder = decoders[entry.cid.code]
    if (!decoder) {
      throw new Error(`unknown codec: ${entry.cid.code}`)
    }
    const decoded = Block.createUnsafe({ bytes: entry.node, cid: entry.cid, codec: decoder })
    const links = []
    for (const [, cid] of decoded.links()) {
      links.push(cid)
    }
    return links
  }

  // raw! no links!
  return []
}
