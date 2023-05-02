import test from 'ava'
import { fromString } from 'multiformats/bytes'
import * as raw from 'multiformats/codecs/raw'
import * as dagPB from '@ipld/dag-pb'
import * as dagCbor from '@ipld/dag-cbor'
import * as dagJson from '@ipld/dag-json'
import { UnixFS as UnixFSv1 } from 'ipfs-unixfs'
import * as UnixFS from '@ipld/unixfs'
import { TransformStream } from 'node:stream/web'
import { sha256 } from 'multiformats/hashes/sha2'
import { identity } from 'multiformats/hashes/identity'
import { CID } from 'multiformats/cid'
import * as Block from 'multiformats/block'
import { getLibp2p, fromNetwork } from '../p2p.js'
import { startBitswapPeer } from './_libp2p.js'

test('should getPath', async t => {
  // should return all blocks in path and all blocks for resolved target of path
  const filePart1 = await Block.encode({ codec: raw, value: fromString(`MORE TEST DATA ${Date.now()}`), hasher: sha256 })
  const filePart2 = await Block.encode({ codec: raw, value: fromString(`EVEN MORE TEST DATA ${Date.now()}`), hasher: sha256 })
  const fileNode = await Block.encode({
    codec: dagPB,
    hasher: sha256,
    value: {
      Data: new UnixFSv1({ type: 'file' }).marshal(),
      Links: [
        { Name: '0', Hash: filePart1.cid },
        { Name: '1', Hash: filePart2.cid }
      ]
    }
  })

  const dirNode = await Block.encode({
    codec: dagPB,
    hasher: sha256,
    value: {
      Data: new UnixFSv1({ type: 'directory' }).marshal(),
      Links: [
        { Name: 'foo', Hash: fileNode.cid },
        { Name: 'other', Hash: CID.parse('QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn') }
      ]
    }
  })

  const peer = await startBitswapPeer([filePart1, filePart2, fileNode, dirNode])

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0] })
  const entries = []
  for await (const entry of dagula.getPath(`${dirNode.cid}/foo`)) {
    entries.push(entry)
  }
  // did not try and return block for `other`
  t.is(entries.length, 4)
  t.deepEqual(entries.at(0).cid, dirNode.cid)
  t.deepEqual(entries.at(0).bytes, dirNode.bytes)
  t.deepEqual(entries.at(1).cid, fileNode.cid)
  t.deepEqual(entries.at(1).bytes, fileNode.bytes)
  t.deepEqual(entries.at(2).cid, filePart1.cid)
  t.deepEqual(entries.at(2).bytes, filePart1.bytes)
  t.deepEqual(entries.at(3).cid, filePart2.cid)
  t.deepEqual(entries.at(3).bytes, filePart2.bytes)
})

test('should getPath through dag-cbor', async t => {
  // should return all blocks in path and all blocks for resolved target of path
  const fileNode = await Block.encode({ codec: raw, value: fromString(`MORE TEST DATA ${Date.now()}`), hasher: sha256 })

  const cborRootNode = await Block.encode({
    codec: dagCbor,
    hasher: sha256,
    value: {
      foo: fileNode.cid,
      other: CID.parse('QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn')
    }
  })

  const peer = await startBitswapPeer([fileNode, cborRootNode])

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0] })
  const entries = []
  for await (const entry of dagula.getPath(`${cborRootNode.cid}/foo`)) {
    entries.push(entry)
  }
  // did not try and return block for `other`
  t.is(entries.length, 2)
  t.deepEqual(entries.at(0).cid, cborRootNode.cid)
  t.deepEqual(entries.at(0).bytes, cborRootNode.bytes)
  t.deepEqual(entries.at(1).cid, fileNode.cid)
  t.deepEqual(entries.at(1).bytes, fileNode.bytes)
})

// TODO: add dag-json to unixfs-exporter (Error: ipfs-unixfs-exporter walkPath: No resolver for code 297)
test.skip('should getPath through dag-json [unixfs-exporter missing dag-json codec]', async t => {
  // should return all blocks in path and all blocks for resolved target of path
  const fileNode = await Block.encode({ codec: raw, value: fromString(`MORE TEST DATA ${Date.now()}`), hasher: sha256 })

  const jsonRootNode = await Block.encode({
    codec: dagJson,
    hasher: sha256,
    value: {
      foo: fileNode.cid,
      other: CID.parse('QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn')
    }
  })

  const peer = await startBitswapPeer([fileNode, jsonRootNode])

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0] })
  const entries = []
  for await (const entry of dagula.getPath(`${jsonRootNode.cid}/foo`)) {
    entries.push(entry)
  }
  // did not try and return block for `other`
  t.is(entries.length, 2)
  t.deepEqual(entries.at(0).cid, jsonRootNode.cid)
  t.deepEqual(entries.at(0).bytes, jsonRootNode.bytes)
  t.deepEqual(entries.at(1).cid, fileNode.cid)
  t.deepEqual(entries.at(1).bytes, fileNode.bytes)
})

test('should getPath through identity encoded dag-cbor', async t => {
  // should return all blocks in path and all blocks for resolved target of path
  const fileNode = await Block.encode({ codec: raw, value: fromString(`MORE TEST DATA ${Date.now()}`), hasher: sha256 })

  const identityCborRootNode = await Block.encode({
    codec: dagCbor,
    hasher: identity,
    value: {
      foo: fileNode.cid,
      other: CID.parse('QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn')
    }
  })

  const peer = await startBitswapPeer([fileNode, identityCborRootNode])

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0] })
  const entries = []
  for await (const entry of dagula.getPath(`${identityCborRootNode.cid}/foo`)) {
    entries.push(entry)
  }
  // did not try and return block for `other`
  t.is(entries.length, 2)
  t.deepEqual(entries.at(0).cid, identityCborRootNode.cid)
  t.deepEqual(entries.at(0).bytes, identityCborRootNode.bytes)
  t.deepEqual(entries.at(1).cid, fileNode.cid)
  t.deepEqual(entries.at(1).bytes, fileNode.bytes)
})

test('should getPath on file with carScope=file', async t => {
  // return all blocks in path and all blocks for resolved target of path
  const filePart1 = await Block.decode({ codec: raw, bytes: fromString(`MORE TEST DATA ${Date.now()}`), hasher: sha256 })
  const filePart2 = await Block.decode({ codec: raw, bytes: fromString(`EVEN MORE TEST DATA ${Date.now()}`), hasher: sha256 })
  const fileNode = await Block.encode({
    codec: dagPB,
    hasher: sha256,
    value: {
      Data: new UnixFSv1({ type: 'file' }).marshal(),
      Links: [
        { Name: '0', Hash: filePart1.cid },
        { Name: '1', Hash: filePart2.cid }
      ]
    }
  })

  const dirNode = await Block.encode({
    codec: dagPB,
    hasher: sha256,
    value: {
      Data: new UnixFSv1({ type: 'directory' }).marshal(),
      Links: [
        { Name: 'foo', Hash: fileNode.cid },
        { Name: 'other', Hash: CID.parse('QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn') }
      ]
    }
  })

  const peer = await startBitswapPeer([filePart1, filePart2, fileNode, dirNode])

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0] })

  const entries = []
  const carScope = 'file'
  for await (const entry of dagula.getPath(`${dirNode.cid}/foo`, { carScope })) {
    entries.push(entry)
  }
  // did not try and return block for `other`
  t.is(entries.length, 4)
  t.deepEqual(entries.at(0).cid, dirNode.cid)
  t.deepEqual(entries.at(0).bytes, dirNode.bytes)
  t.deepEqual(entries.at(1).cid, fileNode.cid)
  t.deepEqual(entries.at(1).bytes, fileNode.bytes)
  t.deepEqual(entries.at(2).cid, filePart1.cid)
  t.deepEqual(entries.at(2).bytes, filePart1.bytes)
  t.deepEqual(entries.at(3).cid, filePart2.cid)
  t.deepEqual(entries.at(3).bytes, filePart2.bytes)
})

test('should getPath on file with carScope=block', async t => {
  // return all blocks in path and all blocks for resolved target of path
  const filePart1 = await Block.decode({ codec: raw, bytes: fromString(`MORE TEST DATA ${Date.now()}`), hasher: sha256 })
  const filePart2 = await Block.decode({ codec: raw, bytes: fromString(`EVEN MORE TEST DATA ${Date.now()}`), hasher: sha256 })
  const fileNode = await Block.encode({
    codec: dagPB,
    hasher: sha256,
    value: {
      Data: new UnixFSv1({ type: 'file' }).marshal(),
      Links: [
        { Name: '0', Hash: filePart1.cid },
        { Name: '1', Hash: filePart2.cid }
      ]
    }
  })

  const dirNode = await Block.encode({
    codec: dagPB,
    hasher: sha256,
    value: {
      Data: new UnixFSv1({ type: 'directory' }).marshal(),
      Links: [
        { Name: 'foo', Hash: fileNode.cid },
        { Name: 'other', Hash: CID.parse('QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn') }
      ]
    }
  })

  const peer = await startBitswapPeer([filePart1, filePart2, fileNode, dirNode])

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0] })
  const entries = []
  const carScope = 'block'
  for await (const entry of dagula.getPath(`${dirNode.cid}/foo`, { carScope })) {
    entries.push(entry)
  }
  // did not try and return block for `other`
  t.is(entries.length, 2)
  t.deepEqual(entries.at(0).cid, dirNode.cid)
  t.deepEqual(entries.at(0).bytes, dirNode.bytes)
  t.deepEqual(entries.at(1).cid, fileNode.cid)
  t.deepEqual(entries.at(1).bytes, fileNode.bytes)
})

test('should getPath on dir with carScope=file', async t => {
  // return all blocks in path. as it's a dir, it should stop there
  const file = await Block.decode({ codec: raw, bytes: fromString(`MORE TEST DATA ${Date.now()}`), hasher: sha256 })

  const dirNode = await Block.encode({
    codec: dagPB,
    hasher: sha256,
    value: {
      Data: new UnixFSv1({ type: 'directory' }).marshal(),
      Links: [
        { Name: 'foo', Hash: file.cid },
        { Name: 'other', Hash: CID.parse('QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn') }
      ]
    }
  })

  const peer = await startBitswapPeer([file, dirNode])

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0] })
  const entries = []
  for await (const entry of dagula.getPath(`${dirNode.cid}`, { carScope: 'file' })) {
    entries.push(entry)
  }
  // only return the dir if carScope=file and target is a dir
  t.is(entries.length, 1)
  t.deepEqual(entries.at(0).cid, dirNode.cid)
  t.deepEqual(entries.at(0).bytes, dirNode.bytes)
})

test('should getPath to a hamt dir with carScope=file', async t => {
  const { readable, writable } = new TransformStream(undefined, UnixFS.withCapacity(1048576 * 32))
  const writer = writable.getWriter()

  const file = UnixFS.createFileWriter({ writer })
  file.write(new TextEncoder().encode('HELP'))
  const fileLink = await file.close()

  const dir = UnixFS.createShardedDirectoryWriter({ writer })
  dir.set('foo', fileLink)
  const dirLink = await dir.close()

  writer.close()

  const blocks = []
  for await (const block of readable) {
    blocks.push(block)
  }

  const peer = await startBitswapPeer(blocks)

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0] })
  const entries = []
  for await (const entry of dagula.getPath(`${dirLink.cid}`, { carScope: 'file' })) {
    entries.push(entry)
  }

  // only return the dir if carScope=file and target is a dir
  t.is(entries.length, 1)
  t.deepEqual(entries.at(0).cid, dirLink.cid)
})

test('should getPath to a sharded hamt dir with carScope=file', async t => {
  const { readable, writable } = new TransformStream(undefined, UnixFS.withCapacity(1048576 * 32))
  const writer = writable.getWriter()

  const file = UnixFS.createFileWriter({ writer })
  file.write(new TextEncoder().encode('HELP'))
  const fileLink = await file.close()

  const dir = UnixFS.createShardedDirectoryWriter({ writer })
  // make a bunch of links to force some imtermediate hamt shards
  for (const x of Array.from(Array(250), (_, i) => i)) {
    dir.set(`empty-${x}`, {
      cid: CID.parse('QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn'),
      dagByteLength: 0
    })
  }
  dir.set('foo', fileLink)
  const dirLink = await dir.close()

  writer.close()

  const blocks = []
  for await (const block of readable) {
    blocks.push(block)
  }

  const peer = await startBitswapPeer(blocks)

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0] })
  const res = []
  for await (const block of dagula.getPath(`${dirLink.cid}`, { carScope: 'file' })) {
    res.push(block)
  }

  // return only the dir if carScope=file and target is a dir. file block should be missing
  t.is(res.length, blocks.length - 1, 'all blocks for sharded dir were included')
  t.deepEqual(res[0].cid, dirLink.cid, 'first block is root of dir')
  t.false(res.some(b => b.cid.toString() === fileLink.cid.toString()), 'linked file was not returned because carScope: file')
})

test('should getPath through sharded hamt dir with carScope=file', async t => {
  const { readable, writable } = new TransformStream(undefined, UnixFS.withCapacity(1048576 * 32))
  const writer = writable.getWriter()

  const file = UnixFS.createFileWriter({ writer })
  file.write(new TextEncoder().encode('HELP'))
  const fileLink = await file.close()

  const dir = UnixFS.createShardedDirectoryWriter({ writer })
  // make a bunch of links to force some imtermediate hamt shards
  for (const x of Array.from(Array(1000), (_, i) => i)) {
    dir.set(`empty-${x}`, {
      cid: CID.parse('QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn'),
      dagByteLength: 0
    })
  }
  dir.set('foo', fileLink)
  const dirLink = await dir.close()

  writer.close()

  const blocks = []
  for await (const block of readable) {
    blocks.push(block)
  }

  const peer = await startBitswapPeer(blocks)

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0] })

  const res = []
  for await (const block of dagula.getPath(`${dirLink.cid}/foo`, { carScope: 'file' })) {
    res.push(block)
  }

  // only return the hamt root, hamt shard, and file block
  t.is(res.length, 3)
  t.deepEqual(res.at(0).cid, dirLink.cid)
  t.deepEqual(res.at(2).cid, fileLink.cid)
})
