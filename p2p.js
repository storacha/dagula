import { createLibp2p } from 'libp2p'
import { WebSockets } from '@libp2p/websockets'
import { TCP } from '@libp2p/tcp'
import { Noise } from '@chainsafe/libp2p-noise'
import { Mplex } from '@libp2p/mplex'

export async function getLibp2p () {
  const libp2p = await createLibp2p({
    transports: [new WebSockets(), new TCP()],
    streamMuxers: [new Mplex({ maxMsgSize: 4 * 1024 * 1024 })],
    connectionEncryption: [new Noise()]
  })
  await libp2p.start()
  return libp2p
}
