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

export interface IDagula {
  /**
   * Get a complete DAG.
   */
  get (cid: CID|string, options?: AbortOptions): AsyncIterableIterator<Block>
  /**
   * Get a single block.
   */
  getBlock (cid: CID|string, options?: AbortOptions): Promise<Block>
  /**
   * Get UnixFS files and directories.
   */
  getUnixfs (path: CID|string, options?: AbortOptions): Promise<UnixFSEntry>
  /**
   * Emit nodes for all path segements and get UnixFS files and directories
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
   * Get a single block.
   */
  getBlock (cid: CID|string, options?: AbortOptions): Promise<Block>
  /**
   * Get UnixFS files and directories.
   */
  getUnixfs (path: CID|string, options?: AbortOptions): Promise<UnixFSEntry>
  /**
   * Emit nodes for all path segements and get UnixFS files and directories
   */
  walkUnixfsPath (path: CID|string, options?: AbortOptions): AsyncIterableIterator<UnixFSEntry>
}
