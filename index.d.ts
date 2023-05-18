import type { BlockDecoder } from 'multiformats/codecs/interface'
import type { MultihashHasher } from 'multiformats/hashes/interface'
import type { CID } from 'multiformats'
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
  cid: CID
  bytes: Uint8Array
}

export interface Blockstore {
  get: (cid: CID, options?: { signal?: AbortSignal }) => Promise<Block | undefined>
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

export interface IDagula {
  /**
   * Get a complete DAG.
   */
  get (cid: CID|string, options?: AbortOptions): AsyncIterableIterator<Block>
  /**
   * Get a DAG for a cid+path.
   */
  getPath (cidPath: string, options?: AbortOptions & DagScopeOptions): AsyncIterableIterator<Block>
  /**
   * Get a single block.
   */
  getBlock (cid: CID|string, options?: AbortOptions): Promise<Block>
  /**
   * Get UnixFS files and directories.
   */
  getUnixfs (path: CID|string, options?: AbortOptions): Promise<UnixFSEntry>
  /**
   * Emit nodes for all path segements and get UnixFS files and directories.
   */
  walkUnixfsPath (path: CID|string, options?: AbortOptions): AsyncIterableIterator<UnixFSEntry>
}

export declare class Dagula implements IDagula {
  constructor (blockstore: Blockstore, options?: { decoders?: BlockDecoders, hashers?: MultihashHashers })
  /**
   * Get a complete DAG.
   */
  get (cid: CID|string, options?: AbortOptions): AsyncIterableIterator<Block>
  /**
   * Get a DAG for a cid+path.
   */
  getPath (cidPath: string, options?: AbortOptions & DagScopeOptions): AsyncIterableIterator<Block>
  /**
   * Get a single block.
   */
  getBlock (cid: CID|string, options?: AbortOptions): Promise<Block>
  /**
   * Get UnixFS files and directories.
   */
  getUnixfs (path: CID|string, options?: AbortOptions): Promise<UnixFSEntry>
  /**
   * Emit nodes for all path segements and get UnixFS files and directories.
   */
  walkUnixfsPath (path: CID|string, options?: AbortOptions): AsyncIterableIterator<UnixFSEntry>
}
