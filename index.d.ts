import type { BlockDecoder } from 'multiformats/codecs/interface'
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

export type CarScope = 'all'|'file'|'block'

export interface CarScopeOptions {
  carScope?: CarScope
}

export interface IDagula {
  /**
   * Get a complete DAG.
   */
  get (cid: CID|string, options?: AbortOptions): AsyncIterableIterator<Block>
  /**
   * Get a DAG for a cid+path
   */
  getPath (cidPath: string, options?: AbortOptions & CarScopeOptions): AsyncIterableIterator<Block>
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
  walkUnixfsPath (path: CID|string, options?: AbortOptions): AsyncIterableIterator<UnixFSEntry & Block>
}

export declare class Dagula implements IDagula {
  constructor (blockstore: Blockstore, options?: { decoders?: BlockDecoders })
  /**
   * Get a complete DAG.
   */
  get (cid: CID|string, options?: AbortOptions): AsyncIterableIterator<Block>
  /**
   * Get a DAG for a cid+path
   */
  getPath (cidPath: string, options?: AbortOptions & CarScopeOptions): AsyncIterableIterator<Block>
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
  walkUnixfsPath (path: CID|string, options?: AbortOptions): AsyncIterableIterator<UnixFSEntry & Block>
  /**
   * Create a new Dagula instance from the passed libp2p Network interface.
   */
  static fromNetwork (network: Network, options?: { decoders?: BlockDecoders, peer?: Multiaddr|string }): Promise<Dagula>
}
