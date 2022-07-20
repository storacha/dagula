import { Libp2p } from 'libp2p'

/**
 * Create and start a default p2p networking stack (libp2p) with generated peer ID.
 */
export declare function getLibp2p (): Promise<Libp2p>
