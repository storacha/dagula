import test from 'ava'
import { createLibp2p } from 'libp2p'
import { WebSockets } from '@libp2p/websockets'
import { Noise } from '@chainsafe/libp2p-noise'
import { Mplex } from '@libp2p/mplex'
import { MemoryBlockstore } from 'blockstore-core/memory'
import { fromString, toString } from 'uint8arrays'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import { CID } from 'multiformats/cid'
import { Miniswap, BITSWAP_PROTOCOL } from 'miniswap'
import { Dagula } from './index.js'

test('should fetch a single CID', async t => {
  // create blockstore and add data
  const serverBlockstore = new MemoryBlockstore()
  const data = fromString(`TEST DATA ${Date.now()}`)
  const hash = await sha256.digest(data)
  const cid = CID.create(1, raw.code, hash)
  await serverBlockstore.put(cid, data)

  const serverAddr = '/ip4/127.0.0.1/tcp/1337/ws'
  const server = await createLibp2p({
    addresses: { listen: [serverAddr] },
    transports: [new WebSockets()],
    streamMuxers: [new Mplex()],
    connectionEncryption: [new Noise()]
  })

  const miniswap = new Miniswap(serverBlockstore)
  server.handle(BITSWAP_PROTOCOL, miniswap.handler)

  console.log('starting server')
  await server.start()

  console.log(`dialing ${serverAddr}/p2p/${server.peerId}`)
  const dagula = new Dagula(`${serverAddr}/p2p/${server.peerId}`)

  for await (const block of dagula.get(cid)) {
    t.is(block.cid.toString(), cid.toString())
    t.is(toString(block.bytes), toString(data))
  }
})
