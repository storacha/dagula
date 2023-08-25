import type { BlockDecoder } from 'multiformats/codecs/interface'
import type { MultihashHasher } from 'multiformats/hashes/interface'
import type { UnknownLink } from 'multiformats'
import type { UnixFSEntry } from 'ipfs-unixfs-exporter'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { AbortOptions } from '@libp2p/interfaces'
import type { Stream } from '@libp2p/interface-connection'
import type { StreamHandler } from '@libp2p/interface-registrar'
import type { PeerId } from '@libp2p/interface-peer-id'

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

export interface Blockstore {
  get: (cid: UnknownLink, options?: { signal?: AbortSignal }) => Promise<Block | undefined>
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
 * Specifies a range of bytes.
 * - `*` can be substituted for end-of-file
 *     - `{ from: 0, to: '*' }` is the entire file.
 * - Negative numbers can be used for referring to bytes from the end of a file
 *     - `{ from: -1024, to: '*' }` is the last 1024 bytes of a file.
 * - It is also permissible to ask for the range of 500 bytes from the
 * beginning of the file to 1000 bytes from the end: `{ from: 499, to: -1000 }`
 */
export interface ByteRange {
  /** Byte-offset of the first byte in a range (inclusive) */
  from: number
  /** Byte-offset of the last byte in the range (inclusive) */
  to: number|'*'
}

export interface EntityBytesOptions {
  /**
   * A specific byte range from the entity. Setting entity bytes implies DAG
   * scope: entity.
   */
  entityBytes?: ByteRange
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

export interface IDagula {
  /**
   * Get a complete DAG by root CID.
   */
  get (cid: UnknownLink|string, options?: AbortOptions & BlockOrderOptions): AsyncIterableIterator<Block>
  /**
   * Get a DAG for a cid+path.
   */
  getPath (cidPath: string, options?: AbortOptions & DagScopeOptions & EntityBytesOptions & BlockOrderOptions): AsyncIterableIterator<Block>
  /**
   * Get a single block.
   */
  getBlock (cid: UnknownLink|string, options?: AbortOptions): Promise<Block>
  /**
   * Get UnixFS files and directories.
   */
  getUnixfs (path: UnknownLink|string, options?: AbortOptions): Promise<UnixFSEntry>
  /**
   * Emit nodes for all path segements and get UnixFS files and directories.
   */
  walkUnixfsPath (path: UnknownLink|string, options?: AbortOptions): AsyncIterableIterator<UnixFSEntry>
}

export declare class Dagula implements IDagula {
  constructor (blockstore: Blockstore, options?: { decoders?: BlockDecoders, hashers?: MultihashHashers })
  /**
   * Get a complete DAG by root CID.
   */
  get (cid: UnknownLink|string, options?: AbortOptions & BlockOrderOptions): AsyncIterableIterator<Block>
  /**
   * Get a DAG for a cid+path.
   */
  getPath (cidPath: string, options?: AbortOptions & DagScopeOptions & EntityBytesOptions & BlockOrderOptions): AsyncIterableIterator<Block>
  /**
   * Get a single block.
   */
  getBlock (cid: UnknownLink|string, options?: AbortOptions): Promise<Block>
  /**
   * Get UnixFS files and directories.
   */
  getUnixfs (path: UnknownLink|string, options?: AbortOptions): Promise<UnixFSEntry>
  /**
   * Emit nodes for all path segements and get UnixFS files and directories.
   */
  walkUnixfsPath (path: UnknownLink|string, options?: AbortOptions): AsyncIterableIterator<UnixFSEntry>
}
