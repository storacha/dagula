import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { MemoryBlockstore } from 'blockstore-core/memory'
import { Miniswap, BITSWAP_PROTOCOL } from 'miniswap'

/**
 * @param {import('..').Block[]}
 */
export async function startBitswapPeer (blocks = []) {
  const libp2p = await createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()],
    streamMuxers: [mplex()],
    connectionEncryption: [noise()]
  })

  const bs = new MemoryBlockstore()
  for (const { cid, bytes } of blocks) {
    bs.put(cid, bytes)
  }

  const miniswap = new Miniswap(bs)
  libp2p.handle(BITSWAP_PROTOCOL, miniswap.handler)

  await libp2p.start()

  return {
    libp2p,
    bs
  }
}
