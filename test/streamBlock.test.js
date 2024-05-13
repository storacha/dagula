import test from 'ava'
import { fromString, toString } from 'multiformats/bytes'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import { CID } from 'multiformats/cid'
import { collect } from 'streaming-iterables'
import { getLibp2p, fromNetwork } from '../p2p.js'
import { startBitswapPeer } from './_libp2p.js'

test('should stream a block', async t => {
  const bytes = fromString(`TEST DATA ${Date.now()}`)
  const hash = await sha256.digest(bytes)
  const cid = CID.create(1, raw.code, hash)
  const peer = await startBitswapPeer([{ cid, bytes }])

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0] })
  const readable = await dagula.streamBlock(cid)
  t.assert(readable)

  // @ts-expect-error one day all things will implement
  const chunks = await collect(readable)
  t.is(await new Blob(chunks).text(), toString(bytes))
})

test('should stream a byte range from a block', async t => {
  const bytes = fromString(`TEST DATA ${Date.now()}`)
  const range = /** @type {import('../index').AbsoluteRange} */ ([5, 8])
  const hash = await sha256.digest(bytes)
  const cid = CID.create(1, raw.code, hash)
  const peer = await startBitswapPeer([{ cid, bytes }])

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0] })
  const readable = await dagula.streamBlock(cid, { range })
  t.assert(readable)

  // @ts-expect-error one day all things will implement
  const chunks = await collect(readable)
  t.is(await new Blob(chunks).text(), toString(bytes.slice(range[0], range[1] + 1)))
})
