import type { BlockDecoder } from 'multiformats/codecs/interface'
import type { MultihashHasher } from 'multiformats/hashes/interface'
import type { UnknownLink } from 'multiformats'
import type { UnixFSEntry } from 'ipfs-unixfs-exporter'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { AbortOptions } from '@libp2p/interfaces'
import type { Stream } from '@libp2p/interface-connection'
import type { StreamHandler } from '@libp2p/interface-registrar'
import type { PeerId } from '@libp2p/interface-peer-id'

export type { AbortOptions }

export interface BlockDecoders {
  [code: number]: BlockDecoder<any, any>
}

export interface MultihashHashers {
  [code: number]: MultihashHasher<any>
}

export interface Block {
  cid: UnknownLink
  bytes: Uint8Array
}

export interface BlockStat {
  /** Total size in bytes of the block. */
  size: number
}

export interface Blockstore extends BlockGetter, BlockStreamer, BlockInspecter {}

export interface BlockGetter {
  /** Retrieve a block. */
  get: (cid: UnknownLink, options?: AbortOptions) => Promise<Block|undefined>
}

export interface BlockStreamer {
  /** Stream bytes from a block. */
  stream: (cid: UnknownLink, options?: AbortOptions & RangeOptions) => Promise<ReadableStream<Uint8Array>|undefined>
}

export interface BlockInspecter {
  /** Retrieve information about a block. */
  stat: (cid: UnknownLink, options?: AbortOptions) => Promise<BlockStat|undefined>
}

export interface Network {
  dialProtocol (peer: PeerId | Multiaddr, protocols: string | string[], options?: AbortOptions): Promise<Stream>
  handle: (protocol: string | string[], handler: StreamHandler) => Promise<void>
}

/**
 * Transmit the entire contiguous DAG that begins at the end of the path query,
 * after blocks required to verify path segments.
 */
export type DagScopeAll = 'all'

/**
 * For queries that traverse UnixFS data, `entity` roughly means return blocks
 * needed to verify the terminating element of the requested content path. For
 * UnixFS, all the blocks needed to read an entire UnixFS file, or enumerate a
 * UnixFS directory. For all queries that reference non-UnixFS data, `entity`
 * is equivalent to `block`.
 */
export type DagScopeEntity = 'entity'

/**
 * Only the root block at the end of the path is returned after blocks required
 * to verify the specified path segments.
 */
export type DagScopeBlock = 'block'

/**
 * Describes the shape of the DAG fetched at the terminus of the specified path
 * whose blocks are returned after the blocks required to traverse path
 * segments.
 */
export type DagScope = DagScopeAll | DagScopeEntity | DagScopeBlock

export interface DagScopeOptions {
  dagScope?: DagScope
}

/**
 * An absolute byte range to extract - always an array of two values
 * corresponding to the first and last bytes (both inclusive). e.g.
 * 
 * ```
 * [100, 200]
 * ```
 */
export type AbsoluteRange = [first: number, last: number]

/**
 * An suffix byte range - always an array of one value corresponding to the
 * first byte to start extraction from (inclusive). e.g.
 * 
 * ```
 * [900]
 * ```
 * 
 * If it is unknown how large a resource is, the last `n` bytes
 * can be requested by specifying a negative value:
 * 
 * ```
 * [-100]
 * ```
 */
export type SuffixRange = [first: number]

/**
 * Byte range to extract - an array of one or two values corresponding to the
 * first and last bytes (both inclusive). e.g.
 * 
 * ```
 * [100, 200]
 * ```
 * 
 * Omitting the second value requests all remaining bytes of the resource. e.g.
 * 
 * ```
 * [900]
 * ```
 * 
 * Alternatively, if it's unknown how large a resource is, the last `n` bytes
 * can be requested by specifying a negative value:
 * 
 * ```
 * [-100]
 * ```
 */
export type Range = AbsoluteRange | SuffixRange

export interface EntityBytesOptions {
  /**
   * A specific byte range from the entity. Setting entity bytes implies DAG
   * scope: entity.
   */
  entityBytes?: Range
}

export interface RangeOptions {
  /** Extracts a specific byte range from the resource. */
  range?: Range
}

/**
 * [Depth-First Search](https://en.wikipedia.org/wiki/Depth-first_search)
 * order, enables streaming responses with minimal memory usage.
 */
export type BlockOrderDepthFirstSearch = 'dfs'

/**
 * Unknown order. In this case, the client cannot make any assumptions about
 * the block order: blocks may arrive in a random order or be a result of a
 * custom DAG traversal algorithm.
 */
export type BlockOrderUnknown = 'unk'

/** Block ordering algorithms. */
export type BlockOrder = BlockOrderDepthFirstSearch | BlockOrderUnknown

export interface BlockOrderOptions {
  /**
   * Specify returned order of blocks in the DAG.
   * Default: `BlockOrderDepthFirstSearch`.
   */
  order?: BlockOrder
}

/** @deprecated Use `BlockService`, `DagService` and `UnixfsService` interface instead. */
export interface IDagula extends BlockService, DagService, UnixfsService {}

export interface BlockService {
  /** Get a single block. */
  getBlock (cid: UnknownLink|string, options?: AbortOptions): Promise<Block>
  /** Retrieve information about a block. */
  statBlock (cid: UnknownLink|string, options?: AbortOptions): Promise<BlockStat>
  /** Stream bytes from a single block. */
  streamBlock (cid: UnknownLink|string, options?: AbortOptions & RangeOptions): Promise<ReadableStream<Uint8Array>>
}

export interface DagService {
  /** Get a complete DAG by root CID. */
  get (cid: UnknownLink|string, options?: AbortOptions & BlockOrderOptions): AsyncIterableIterator<Block>
  /** Get a DAG for a cid+path. */
  getPath (cidPath: string, options?: AbortOptions & DagScopeOptions & EntityBytesOptions & BlockOrderOptions): AsyncIterableIterator<Block>
}

export interface UnixfsService {
  /** Get UnixFS files and directories. */
  getUnixfs (path: UnknownLink|string, options?: AbortOptions): Promise<UnixFSEntry>
  /** Emit nodes for all path segements and get UnixFS files and directories. */
  walkUnixfsPath (path: UnknownLink|string, options?: AbortOptions): AsyncIterableIterator<UnixFSEntry>
}

export declare class Dagula implements BlockService, DagService, UnixfsService {
  constructor (blockstore: Blockstore, options?: { decoders?: BlockDecoders, hashers?: MultihashHashers })
  /** Get a complete DAG by root CID. */
  get (cid: UnknownLink|string, options?: AbortOptions & BlockOrderOptions): AsyncIterableIterator<Block>
  /** Get a DAG for a cid+path. */
  getPath (cidPath: string, options?: AbortOptions & DagScopeOptions & EntityBytesOptions & BlockOrderOptions): AsyncIterableIterator<Block>
  /** Get a single block. */
  getBlock (cid: UnknownLink|string, options?: AbortOptions): Promise<Block>
  /** Retrieve information about a block. */
  statBlock (cid: UnknownLink|string, options?: AbortOptions): Promise<BlockStat>
  /** Stream bytes from a single block. */
  streamBlock (cid: UnknownLink|string, options?: AbortOptions & RangeOptions): Promise<ReadableStream<Uint8Array>>
  /** Get UnixFS files and directories. */
  getUnixfs (path: UnknownLink|string, options?: AbortOptions): Promise<UnixFSEntry>
  /** Emit nodes for all path segements and get UnixFS files and directories. */
  walkUnixfsPath (path: UnknownLink|string, options?: AbortOptions): AsyncIterableIterator<UnixFSEntry>
}
