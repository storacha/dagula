import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import debug from 'debug'

const log = debug('dagula:p2p')

export async function getLibp2p () {
  const libp2p = await createLibp2p({
    transports: [webSockets(), tcp()],
    streamMuxers: [mplex({ maxMsgSize: 4 * 1024 * 1024 })],
    connectionEncryption: [noise()]
  })
  await libp2p.start()
  log(libp2p.peerId.toString())
  return libp2p
}
