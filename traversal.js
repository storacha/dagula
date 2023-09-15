import * as raw from 'multiformats/codecs/raw'

/** @typedef {{ cid: import('multiformats').UnknownLink }} ContentAddressedObject An object with a CID property. */

/**
 * Create a depth-first search function.
 * Call it with the latest links, it returns the link(s) to follow next.
 * Maintains a queue of links it has seen but not offered up yet.
 *
 * In depth first, we have to resolve links one at a time; we have to
 * find out if there are child links to follow before trying siblings.
 *
 * The exception to this rule is when the child links are IPLD "raw" and
 * we know upfront they have no links to follow. In this case we can return
 * multiple.
 *
 * e.g.
 *
 * ```
 * o
 * ├── x
 * │   ├── x1 (raw)
 * │   └── x2 (raw)
 * │   └── x2 (raw)
 * ├── y
 * └── z
 *     └── z1
 *
 * [x, y, z] => [x]       (queue: [y, z])
 *  [x1, x2] => [x1, x2]  (queue: [y, z])
 *        [] => [y]       (queue: [z])
 *        [] => [z]       (queue: [])
 *      [z1] => [z1]      (queue: [])
 * ```
 */
export function depthFirst () {
  /**
   * @template {ContentAddressedObject} T
   * @type {T[]}
   */
  let queue = []

  /**
   * @template {ContentAddressedObject} T
   * @param {T[]} links
   */
  return (links = []) => {
    queue = links.concat(queue)
    const next = []
    for (let i = 0; i < queue.length; i++) {
      next.push(queue[i])
      // if this item is not raw, do not return any more items after it, since
      // it may have links we need to descend into and return before anything
      // else that is already queued.
      if (queue[i].cid.code !== raw.code) {
        break
      }
    }
    queue = queue.slice(next.length)
    return next
  }
}

/**
 * Create a trivial breadth first search that returns the links you give it
 */
export function breadthFirst () {
  /**
   * @template {ContentAddressedObject} T
   * @param {T[]} links
   */
  return links => links
}
