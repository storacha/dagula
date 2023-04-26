import type { Libp2p } from 'libp2p'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { Network, BlockDecoders, IDagula, MultihashHashers } from './index'

/**
 * Create and start a default p2p networking stack (libp2p) with generated peer ID.
 */
export declare function getLibp2p (): Promise<Libp2p>

/**
 * Create a new Dagula instance from the passed libp2p Network interface.
 */
export declare function fromNetwork (network: Network, options?: { decoders?: BlockDecoders, hashers?: MultihashHashers, peer?: Multiaddr|string }): Promise<IDagula>
