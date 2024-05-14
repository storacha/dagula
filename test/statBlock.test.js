import test from 'ava'
import { fromString } from 'multiformats/bytes'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import { CID } from 'multiformats/cid'
import { getLibp2p, fromNetwork } from '../p2p.js'
import { startBitswapPeer } from './_libp2p.js'

test('should stat a block', async t => {
  const bytes = fromString(`TEST DATA ${Date.now()}`)
  const hash = await sha256.digest(bytes)
  const cid = CID.create(1, raw.code, hash)
  const peer = await startBitswapPeer([{ cid, bytes }])

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0] })
  const { size } = await dagula.statBlock(cid)

  t.is(size, bytes.length)
})
