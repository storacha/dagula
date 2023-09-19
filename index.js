import debug from 'debug'
import { CID } from 'multiformats/cid'
import * as dagPB from '@ipld/dag-pb'
import * as Block from 'multiformats/block'
import { UnixFS } from 'ipfs-unixfs'
import { exporter, walkPath } from 'ipfs-unixfs-exporter'
import { parallelMap, transform } from 'streaming-iterables'
import { Decoders, Hashers } from './defaults.js'
import { identity } from 'multiformats/hashes/identity'
import { depthFirst, breadthFirst } from './traversal.js'

/**
 * @typedef {{ unixfs?: UnixFS }} LinkFilterContext
 * @typedef {([name, cid]: [string, import('multiformats').UnknownLink], context: LinkFilterContext) => boolean} LinkFilter
 * @typedef {[from: number, to: number]} Range
 * @typedef {{ cid: import('multiformats').UnknownLink, range?: Range }} GraphSelector
 */

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
   * @param {import('./index').ByteRange} [options.entityBytes]
   * @param {LinkFilter} [options.filter]
   */
  async * get (cid, options = {}) {
    cid = typeof cid === 'string' ? CID.parse(cid) : cid
    log('getting DAG %s', cid)
    yield * this.#get((Array.isArray(cid) ? cid : [cid]).map(cid => ({ cid })), options)
  }

  /**
   * @param {GraphSelector[]} selectors
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @param {import('./index').BlockOrder} [options.order]
   * @param {LinkFilter} [options.filter]
   */
  async * #get (selectors, options = {}) {
    const order = options.order ?? 'dfs'

    // fn to track which links to follow next
    const search = order === 'dfs' ? depthFirst() : breadthFirst()

    // fn to normalize extracting links from different block types
    const getLinks = blockLinks(options.filter)

    selectors = search(selectors)

    /** @type {AbortController[]} */
    let aborters = []
    const { signal } = options
    signal?.addEventListener('abort', () => aborters.forEach(a => a.abort(signal.reason)))

    while (selectors.length > 0) {
      log('fetching %d CIDs', selectors.length)
      const parallelFn = order === 'dfs' ? parallelMap : transform
      const fetchBlocks = parallelFn(selectors.length, async selector => {
        if (signal) {
          const aborter = new AbortController()
          aborters.push(aborter)
          const block = await this.getBlock(selector.cid, { signal: aborter.signal })
          aborters = aborters.filter(a => a !== aborter)
          return { selector, block }
        }
        const block = await this.getBlock(selector.cid)
        return { selector, block }
      })
      /** @type {GraphSelector[]} */
      const nextSelectors = []
      for await (const { block: { cid, bytes }, selector } of fetchBlocks(selectors)) {
        const decoder = this.#decoders[cid.code]
        if (!decoder) {
          throw new Error(`unknown codec: 0x${cid.code.toString(16)}`)
        }
        const hasher = this.#hashers[cid.multihash.code]
        if (!hasher) {
          throw new Error(`unknown multihash codec: 0x${cid.multihash.code.toString(16)}`)
        }
        log('decoding block %s', cid)
        // bitswap-fetcher _must_ verify hashes on receipt of a block, but we
        // cannot guarantee the blockstore passed is a bitswap so cannot use
        // createUnsafe here.
        const block = await Block.create({ bytes, cid, codec: decoder, hasher })
        yield block
        nextSelectors.push(...getLinks(block, selector))
      }
      log('%d CIDs in links', nextSelectors.length)
      // reduce the next selectors in the links to the ones that should be
      // considered for the given DAG traversal method. e.g. if using DFS and
      // next selectors has 1 raw block, and 2 non-raw blocks, then the DFS
      // search will reduce the next selectors down to just the first 2 items,
      // since the second item (the non-raw block) may have links that need to
      // be traversed before the others.
      selectors = search(nextSelectors)
    }
  }

  /**
   * Yield all blocks traversed to resolve the ipfs path.
   * Then use dagScope to determine the set of blocks of the targeted dag to yield.
   * Yield all blocks by default.
   * Use dagScope: 'block' to yield the terminal block.
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
   * @param {import('./index').ByteRange} [options.entityBytes]
   */
  async * getPath (cidPath, options = {}) {
    const dagScope = options.dagScope ?? (options.entityBytes ? 'entity' : 'all')
    const entityBytes = dagScope === 'entity' ? options.entityBytes : undefined

    /**
     * The resolved dag root at the terminus of the cidPath
     * @type {import('ipfs-unixfs-exporter').UnixFSEntry?}
     */
    let base = null

    /**
     * Cache of blocks required to resolve the cidPath
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
    try {
      for await (const item of walkPath(cidPath, blockstore, { signal: options.signal })) {
        base = item
        yield * traversed
        traversed = []
      }
    } catch (err) {
      // yield all traversed blocks even if the path was not found. This allows
      // the caller to verify the path does not exist for themselves.
      if (err.code === 'ERR_NOT_FOUND') {
        yield * traversed
      }
      throw err
    }
    if (!base) throw new Error('walkPath did not yield an entry')

    if (dagScope === 'all' || (dagScope === 'entity' && base.type !== 'directory')) {
      /** @type {Range|undefined} */
      let range
      if (entityBytes) {
        const size = Number(base.size)
        // resolve entity bytes to actual byte offsets
        range = [
          entityBytes.from < 0
            ? size - 1 + entityBytes.from
            : entityBytes.from,
          entityBytes.to === '*'
            ? size - 1
            : entityBytes.to < 0
              ? size - 1 + entityBytes.to
              : entityBytes.to
        ]
      }
      const selectors = getUnixfsEntryLinkSelectors(base, this.#decoders, range)
      yield * this.#get(selectors, { signal: options.signal, order: options.order })
    }
    // non-files, like directories, and IPLD Maps only return blocks necessary for their enumeration
    if (dagScope === 'entity' && base.type === 'directory') {
      // the single block for the root has already been yielded.
      // For a hamt we must fetch all the blocks of the (current) hamt.
      if (base.unixfs.type === 'hamt-sharded-directory') {
        const padLength = getUnixfsHamtPadLength(base.unixfs.fanout)
        const hamtLinks = base.node.Links?.filter(l => l.Name?.length === padLength).map(l => l.Hash) || []
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
    yield * walkPath(cidPath, blockstore, { signal: options.signal })
  }
}

/**
 * Create a search function that given a decoded Block and selector, will
 * return an array of `GraphSelector` of things to fetch next.
 *
 * @param {LinkFilter} linkFilter
 */
export function blockLinks (linkFilter = () => true) {
  /**
   * @param {import('multiformats').BlockView<any, any, any, import('multiformats').Version>} block
   * @param {GraphSelector} selector
   */
  return function (block, selector) {
    if (isDagPB(block)) {
      if (selector.range) {
        const data = UnixFS.unmarshal(block.value.Data ?? new Uint8Array())
        if (data.type === 'file') {
          const ranges = toRanges(data.blockSizes.map(Number))
          /** @type {GraphSelector[]} */
          const selectors = []
          for (let i = 0; i < block.value.Links.length; i++) {
            const { Name, Hash } = block.value.Links[i]
            if (linkFilter([Name ?? '', Hash], { unixfs: data })) {
              const relRange = toRelativeRange(selector.range, ranges[i])
              if (relRange) selectors.push({ cid: block.value.Links[i].Hash, range: relRange })
            }
          }
          return selectors
        }
      }

      const filterCtx = {
        get unixfs () {
          return UnixFS.unmarshal(block.value.Data ?? new Uint8Array())
        }
      }
      return block.value.Links
        .filter(({ Name, Hash }) => linkFilter([Name ?? '', Hash], filterCtx))
        .map(l => ({ cid: l.Hash }))
    }

    /** @type {GraphSelector[]} */
    const selectors = []
    // links() paths dagPb in the ipld style so name is e.g `Links/0/Hash`, and not what we want here.
    for (const link of block.links()) {
      if (linkFilter(link, {})) {
        selectors.push({ cid: link[1] })
      }
    }
    return selectors
  }
}

/**
 * @param {import('multiformats').BlockView<unknown, number, number, 0|1>} block
 * @returns {block is import('multiformats').BlockView<dagPB.PBNode, typeof dagPB.code, any, import('multiformats').Version>}
 */
const isDagPB = block => block.cid.code === dagPB.code

/** @type {LinkFilter} */
export const hamtFilter = ([name], ctx) => ctx.unixfs ? name?.length === getUnixfsHamtPadLength(ctx.unixfs.fanout) : false

/**
 * Converts an array of block sizes to an array of byte ranges.
 * @param {number[]} blockSizes
 */
function toRanges (blockSizes) {
  const ranges = []
  let offset = 0
  for (const size of blockSizes) {
    /** @type {Range} */
    const absRange = [offset, offset + size - 1]
    ranges.push(absRange)
    offset += size
  }
  return ranges
}

/**
 * Given two absolute ranges `a` and `b`, calculate the intersection and
 * convert to a relative range within `b`.
 *
 * Examples:
 * ```js
 * toRelativeRange([100,200], [150,300]): [0,50]
 * toRelativeRange([100,200], [50,250]): [50,100]
 * toRelativeRange([100,200], [25,110]): [75,10]
 * toRelativeRange([100,200], [300,400]): undefined
 * ```
 *
 * @param {Range} a
 * @param {Range} b
 * @returns {Range|undefined}
 */
const toRelativeRange = (a, b) => {
  // starts in range
  if (b[0] >= a[0] && b[0] <= a[1]) {
    // ends in range
    if (b[1] >= a[0] && b[1] <= a[1]) {
      return [0, b[1] - b[0]]
    // ends out of range
    } else {
      return [0, a[1] - b[0]]
    }
  // ends in range
  } else if (b[1] >= a[0] && b[1] <= a[1]) {
    return [a[0] - b[0], b[1] - a[0]]
  // covers whole range
  } else if (b[0] < a[0] && b[1] > a[1]) {
    return [a[0] - b[0], a[1] - a[0]]
  }
}

/**
 * Get selectors for a UnixFS entry's links with their corresponding relative
 * byte ranges.
 *
 * @param {import('ipfs-unixfs-exporter').UnixFSEntry} entry
 * @param {import('./index').BlockDecoders} decoders
 * @param {Range} [range]
 * @returns {GraphSelector[]}
 */
function getUnixfsEntryLinkSelectors (entry, decoders, range) {
  if (entry.type === 'file') {
    if (range) {
      const blockSizes = entry.unixfs.blockSizes.map(s => Number(s))
      /** @type {GraphSelector[]} */
      const selectors = []
      // create selectors, filtering out links that do not contain data in the range.
      for (const [i, absRange] of toRanges(blockSizes).entries()) {
        if (absRange[0] > range[1]) break
        const relRange = toRelativeRange(range, absRange)
        if (relRange) selectors.push({ cid: entry.node.Links[i].Hash, range: relRange })
      }
      return selectors
    }
    return entry.node.Links.map(l => ({ cid: l.Hash }))
  }

  if (entry.type === 'directory') {
    return entry.node.Links.map(l => ({ cid: l.Hash }))
  }

  if (entry.type === 'object' || entry.type === 'identity') {
    // UnixFSEntry `node` is Uint8Array for objects and identity blocks!
    // so we have to decode them again to get the links here.
    const decoder = decoders[entry.cid.code]
    if (!decoder) {
      throw new Error(`unknown codec: 0x${entry.cid.code.toString(16)}`)
    }
    const decoded = Block.createUnsafe({ bytes: entry.node, cid: entry.cid, codec: decoder })
    const selectors = []
    for (const [, cid] of decoded.links()) {
      selectors.push({ cid })
    }
    return selectors
  }

  // raw! no links!
  return []
}

/** @param {number|bigint|undefined} fanout */
function getUnixfsHamtPadLength (fanout) {
  if (!fanout) throw new Error('missing fanout')
  return (Number(fanout) - 1).toString(16).length
}
