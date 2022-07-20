import type { BlockDecoder } from 'multiformats/codecs/interface'
import type { CID } from 'multiformats'
import type { UnixFSEntry } from 'ipfs-unixfs-exporter'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { AbortOptions } from '@libp2p/interfaces'
import type { ProtocolStream } from '@libp2p/interfaces/connection'
import type { StreamHandler } from '@libp2p/interfaces/registrar'
import type { PeerId } from '@libp2p/interfaces/peer-id'

export interface BlockDecoders {
  [code: number]: BlockDecoder<any, any>
}

export interface Block {
  cid: CID
  bytes: Uint8Array
}

export interface Network {
  dialProtocol (peer: PeerId | Multiaddr, protocols: string | string[], options?: AbortOptions): Promise<ProtocolStream>
  handle: (protocol: string | string[], handler: StreamHandler) => Promise<void>
}

export declare class Dagula {
  constructor (network: Network, peer?: Multiaddr|string, options?: { decoders?: BlockDecoders })
  get (cid: CID|string, options?: AbortOptions): AsyncIterableIterator<Block>
  getBlock (cid: CID|string, options?: AbortOptions): Promise<Uint8Array>
  getUnixfs (path: CID|string, options?: AbortOptions): Promise<UnixFSEntry>
}
