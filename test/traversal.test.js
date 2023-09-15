import test from 'ava'
import * as Link from 'multiformats/link'
import { breadthFirst, depthFirst } from '../traversal.js'

/** @typedef {{ cid: import('multiformats').UnknownLink, links: BlockFixture[] }} BlockFixture */

/*
DAG looks like:
- bafybeiadwbtmvpjp5z5ogb4a6nubsca2edpgwjpu2nc4p6voxpizqr7bxm
  - bafybeidy4bxkuarnyf4o5ue467axle6tukqbpdulorrbneycgsihqgne6u
    - bafkreihbvksijmidg6imolddzkyse2azgewirljymybzsqz6y53bozhsuy
    - bafkreifoyyvt5q4vkdhmrygewnbq7rqbkrbtkbxkhqzgt3m6ockew2xat4
  - bafybeiekqr2ksbjoyssjfpfhw5zuahffvswgg3dqzwamcivrd7kvnw7kgi
    - bafkreiekffiubbdy33otvzb2txuw66xvhsyimb5emditnj74hvwnogpi3u
    - bafkreihonbrwz4skbrdse7g2zewm6scxspeziyyafpmg5s7kyiedlx25va
  - bafkreia7r7kgduaobnmrzebcxfhtshnscvhivz7qvydmzp4fmzmlkj25zi
  - bafkreiatglcrcgjn7lbo5wyvgcyymyisdh2cbrwoifrxusud5btsf3hfrq
  - bafybeic33d557xulugldf6iai5mvbotaqilxxvgnvgeuudg4fxu27n6av4
    - bafkreiguu7x4cfggoegivvvwjs7sxelc6ls32xm5mtpah5ybgmegsushqi
    - bafkreihg2s4tmyw2acaejgomhowudk7rixxp4eg6onla27xzh3sxove7j4
  - bafkreihwslfxu2bwzgmd47rhxmnxjzauxncmfdv3s4cegxgtfn3aybuhy4
 */

const fixture = {
  root: 'bafybeiadwbtmvpjp5z5ogb4a6nubsca2edpgwjpu2nc4p6voxpizqr7bxm',
  order: {
    depthFirst: [
      'bafybeiadwbtmvpjp5z5ogb4a6nubsca2edpgwjpu2nc4p6voxpizqr7bxm',
      'bafybeidy4bxkuarnyf4o5ue467axle6tukqbpdulorrbneycgsihqgne6u',
      'bafkreihbvksijmidg6imolddzkyse2azgewirljymybzsqz6y53bozhsuy',
      'bafkreifoyyvt5q4vkdhmrygewnbq7rqbkrbtkbxkhqzgt3m6ockew2xat4',
      'bafybeiekqr2ksbjoyssjfpfhw5zuahffvswgg3dqzwamcivrd7kvnw7kgi',
      'bafkreiekffiubbdy33otvzb2txuw66xvhsyimb5emditnj74hvwnogpi3u',
      'bafkreihonbrwz4skbrdse7g2zewm6scxspeziyyafpmg5s7kyiedlx25va',
      'bafkreia7r7kgduaobnmrzebcxfhtshnscvhivz7qvydmzp4fmzmlkj25zi',
      'bafkreiatglcrcgjn7lbo5wyvgcyymyisdh2cbrwoifrxusud5btsf3hfrq',
      'bafybeic33d557xulugldf6iai5mvbotaqilxxvgnvgeuudg4fxu27n6av4',
      'bafkreiguu7x4cfggoegivvvwjs7sxelc6ls32xm5mtpah5ybgmegsushqi',
      'bafkreihg2s4tmyw2acaejgomhowudk7rixxp4eg6onla27xzh3sxove7j4',
      'bafkreihwslfxu2bwzgmd47rhxmnxjzauxncmfdv3s4cegxgtfn3aybuhy4'
    ],
    breadthFirst: [
      'bafybeiadwbtmvpjp5z5ogb4a6nubsca2edpgwjpu2nc4p6voxpizqr7bxm',
      'bafybeidy4bxkuarnyf4o5ue467axle6tukqbpdulorrbneycgsihqgne6u',
      'bafybeiekqr2ksbjoyssjfpfhw5zuahffvswgg3dqzwamcivrd7kvnw7kgi',
      'bafkreia7r7kgduaobnmrzebcxfhtshnscvhivz7qvydmzp4fmzmlkj25zi',
      'bafkreiatglcrcgjn7lbo5wyvgcyymyisdh2cbrwoifrxusud5btsf3hfrq',
      'bafybeic33d557xulugldf6iai5mvbotaqilxxvgnvgeuudg4fxu27n6av4',
      'bafkreihwslfxu2bwzgmd47rhxmnxjzauxncmfdv3s4cegxgtfn3aybuhy4',
      'bafkreihbvksijmidg6imolddzkyse2azgewirljymybzsqz6y53bozhsuy',
      'bafkreifoyyvt5q4vkdhmrygewnbq7rqbkrbtkbxkhqzgt3m6ockew2xat4',
      'bafkreiekffiubbdy33otvzb2txuw66xvhsyimb5emditnj74hvwnogpi3u',
      'bafkreihonbrwz4skbrdse7g2zewm6scxspeziyyafpmg5s7kyiedlx25va',
      'bafkreiguu7x4cfggoegivvvwjs7sxelc6ls32xm5mtpah5ybgmegsushqi',
      'bafkreihg2s4tmyw2acaejgomhowudk7rixxp4eg6onla27xzh3sxove7j4'
    ]
  },
  /** @type {Map<string, string[]>} */
  blocks: new Map([
    [
      'bafybeiadwbtmvpjp5z5ogb4a6nubsca2edpgwjpu2nc4p6voxpizqr7bxm',
      [
        'bafybeidy4bxkuarnyf4o5ue467axle6tukqbpdulorrbneycgsihqgne6u',
        'bafybeiekqr2ksbjoyssjfpfhw5zuahffvswgg3dqzwamcivrd7kvnw7kgi',
        'bafkreia7r7kgduaobnmrzebcxfhtshnscvhivz7qvydmzp4fmzmlkj25zi',
        'bafkreiatglcrcgjn7lbo5wyvgcyymyisdh2cbrwoifrxusud5btsf3hfrq',
        'bafybeic33d557xulugldf6iai5mvbotaqilxxvgnvgeuudg4fxu27n6av4',
        'bafkreihwslfxu2bwzgmd47rhxmnxjzauxncmfdv3s4cegxgtfn3aybuhy4'
      ]
    ],
    [
      'bafybeidy4bxkuarnyf4o5ue467axle6tukqbpdulorrbneycgsihqgne6u',
      [
        'bafkreihbvksijmidg6imolddzkyse2azgewirljymybzsqz6y53bozhsuy',
        'bafkreifoyyvt5q4vkdhmrygewnbq7rqbkrbtkbxkhqzgt3m6ockew2xat4'
      ]
    ],
    [
      'bafkreihbvksijmidg6imolddzkyse2azgewirljymybzsqz6y53bozhsuy',
      []
    ],
    [
      'bafkreifoyyvt5q4vkdhmrygewnbq7rqbkrbtkbxkhqzgt3m6ockew2xat4',
      []
    ],
    [
      'bafybeiekqr2ksbjoyssjfpfhw5zuahffvswgg3dqzwamcivrd7kvnw7kgi',
      [
        'bafkreiekffiubbdy33otvzb2txuw66xvhsyimb5emditnj74hvwnogpi3u',
        'bafkreihonbrwz4skbrdse7g2zewm6scxspeziyyafpmg5s7kyiedlx25va'
      ]
    ],
    [
      'bafkreiekffiubbdy33otvzb2txuw66xvhsyimb5emditnj74hvwnogpi3u',
      []
    ],
    [
      'bafkreihonbrwz4skbrdse7g2zewm6scxspeziyyafpmg5s7kyiedlx25va',
      []
    ],
    [
      'bafkreia7r7kgduaobnmrzebcxfhtshnscvhivz7qvydmzp4fmzmlkj25zi',
      []
    ],
    [
      'bafkreiatglcrcgjn7lbo5wyvgcyymyisdh2cbrwoifrxusud5btsf3hfrq',
      []
    ],
    [
      'bafybeic33d557xulugldf6iai5mvbotaqilxxvgnvgeuudg4fxu27n6av4',
      [
        'bafkreiguu7x4cfggoegivvvwjs7sxelc6ls32xm5mtpah5ybgmegsushqi',
        'bafkreihg2s4tmyw2acaejgomhowudk7rixxp4eg6onla27xzh3sxove7j4'
      ]
    ],
    [
      'bafkreiguu7x4cfggoegivvvwjs7sxelc6ls32xm5mtpah5ybgmegsushqi',
      []
    ],
    [
      'bafkreihg2s4tmyw2acaejgomhowudk7rixxp4eg6onla27xzh3sxove7j4',
      []
    ],
    [
      'bafkreihwslfxu2bwzgmd47rhxmnxjzauxncmfdv3s4cegxgtfn3aybuhy4',
      []
    ]
  ])
}

for (const traversalFn of [depthFirst, breadthFirst]) {
  test(`should traverse ${traversalFn.name}`, async t => {
    const traverse = traversalFn()
    const order = []
    const root = Link.parse(fixture.root)

    let links = [{ cid: root }]
    while (links.length > 0) {
      const nextLinks = []
      for (const item of links) {
        order.push(item.cid.toString())
        const links = fixture.blocks.get(item.cid.toString())
        if (links == null) throw new Error(`missing block in fixture: ${item.cid}`)
        nextLinks.push(...links.map(l => ({ cid: Link.parse(l) })))
      }
      links = traverse(nextLinks)
    }

    t.deepEqual(order, fixture.order[traversalFn.name])
  })
}
