<div align="center">
  <img src="https://bafybeieyeb3zoyob7sdbgcx5uvd6vesdycrtry6j34jenx4oavejegay54.ipfs.dweb.link/dagula.png" width="50%"/>
</div>

# dagula

[![Build](https://github.com/alanshaw/dagula/actions/workflows/build.yml/badge.svg)](https://github.com/alanshaw/dagula/actions/workflows/build.yml)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

Suck a DAG out of a peer in the IPFS network.

## Install

```
npm i dagula
```

## Usage

```js
import { Dagula } from 'dagula'
import { CID } from 'multiformats/cid'

const peer = '/dns4/peer.ipfs-elastic-provider-aws.com/tcp/3000/ws/p2p/bafzbeibhqavlasjc7dvbiopygwncnrtvjd2xmryk5laib7zyjor6kf3avm'
const dagula = new Dagula(peer)

// fetch entire DAG
const cid = 'bafybeig4qjehigdddcoka23crh2s3vrautbep3topuoqblb4chkvvhpilu'
for await (const block of dagula.get(cid)) {
  console.log(`${block.cid} (${block.bytes.length} bytes)`)
}

// fetch a file/directory
const path = 'bafybeiggvykl7skb2ndlmacg2k5modvudocffxjesexlod2pfvg5yhwrqm/2998.png'
for await (const entry of dagula.getUnixfs(path)) {
  console.log(`${entry.path} (${entry.size} bytes)`)
  // note: use `entry.content()` to get file data
}
```

### CLI

```sh
# fetch a complete DAG (output format is CAR)
dagula get bafybeidtzj4g33h4d76nfyznjfcejyigejrjpqfzm6ydapuhd26asjg5re > output.car

# fetch a UnixFS file
dagula unixfs get bafybeidtzj4g33h4d76nfyznjfcejyigejrjpqfzm6ydapuhd26asjg5re/path/to/data.txt

# fetch a specific block
dagula block get bafybeidtzj4g33h4d76nfyznjfcejyigejrjpqfzm6ydapuhd26asjg5re

# configure peer to use
dagula peer set /dns4/peer.ipfs-elastic-provider-aws.com/tcp/3000/ws/p2p/bafzbeibhqavlasjc7dvbiopygwncnrtvjd2xmryk5laib7zyjor6kf3avm
```

## Contributing

Feel free to join in. All welcome. [Open an issue](https://github.com/alanshaw/dagula/issues)!

## License

Dual-licensed under [MIT + Apache 2.0](https://github.com/alanshaw/dagula/blob/main/LICENSE.md)
