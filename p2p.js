import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { mplex } from '@libp2p/mplex'
import debug from 'debug'
import { multiaddr } from '@multiformats/multiaddr'
import { Dagula } from './index.js'
import { BitswapFetcher } from './bitswap-fetcher.js'

/**
 * @typedef {import('./index').BlockDecoders} BlockDecoders
 * @typedef {import('./index').MultihashHashers} MultihashHashers
 */

const BITSWAP_PROTOCOL = '/ipfs/bitswap/1.2.0'
const ELASTIC_IPFS = multiaddr('/dns4/elastic.dag.house/tcp/443/wss/p2p/bafzbeibhqavlasjc7dvbiopygwncnrtvjd2xmryk5laib7zyjor6kf3avm')

const log = debug('dagula:p2p')

export async function getLibp2p () {
  const libp2p = await createLibp2p({
    transports: [webSockets(), tcp()],
    streamMuxers: [
      yamux({ direction: 'outbound' }),
      mplex({ maxMsgSize: 4 * 1024 * 1024 })
    ],
    connectionEncryption: [noise()]
  })
  await libp2p.start()
  log(libp2p.peerId.toString())
  return libp2p
}

/**
   * @param {import('./index').Network} network
   * @param {{ decoders?: BlockDecoders, hashers?: MultihashHashers, peer?: import('@multiformats/multiaddr').Multiaddr }} [options]
   */
export async function fromNetwork (network, options = {}) {
  const peer = (typeof options.peer === 'string' ? multiaddr(options.peer) : options.peer) || ELASTIC_IPFS
  const bitswap = new BitswapFetcher(async () => {
    log('new stream to %s', peer)
    // @ts-ignore
    const stream = await network.dialProtocol(peer, BITSWAP_PROTOCOL, { lazy: true })
    return stream
  }, options)

  // incoming blocks
  await network.handle(BITSWAP_PROTOCOL, bitswap.handler)

  return new Dagula(bitswap, options)
}
