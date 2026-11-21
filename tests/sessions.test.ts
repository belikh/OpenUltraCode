import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createSessionTree, type OpenCodePluginContext } from "../src/index.js"

function fakeSessions(parents: Record<string, string>, failing: readonly string[] = []) {
  const lookups: string[] = []
  const session = {
    get(input: { sessionID: string }) {
      lookups.push(input.sessionID)
      if (failing.includes(input.sessionID)) return Promise.reject(new Error("session not found"))
      const parentID = parents[input.sessionID]
      return Promise.resolve({ id: input.sessionID, ...(parentID === undefined ? {} : { parentID }) })
    }
  } as unknown as OpenCodePluginContext["session"]
  return { tree: createSessionTree({ session }), lookups }
}

describe("session ancestry", () => {
  it("resolves a session to the top-level session it descends from", async () => {
    const { tree } = fakeSessions({ grandchild: "child", child: "root" })

    assert.equal(await tree.root("root"), "root")
    assert.equal(await tree.root("child"), "root")
    assert.equal(await tree.root("grandchild"), "root")
  })

  it("asks opencode about each session only once", async () => {
    const { tree, lookups } = fakeSessions({ grandchild: "child", child: "root", sibling: "child" })

    await tree.root("grandchild")
    await tree.root("grandchild")
    await tree.root("sibling")

    assert.deepEqual(lookups, ["grandchild", "child", "root", "sibling"])
  })

  it("reports unknown ancestry instead of guessing, and asks again next time", async () => {
    const { tree, lookups } = fakeSessions({ child: "gone" }, ["gone"])

    assert.equal(await tree.root("child"), undefined)
    assert.equal(await tree.root("child"), undefined)
    assert.equal(await tree.root(undefined), undefined)
    assert.equal(await tree.root(""), undefined)
    assert.deepEqual(lookups, ["child", "gone", "child", "gone"])
  })

  it("gives up on a parent chain that never ends", async () => {
    const { tree } = fakeSessions({ a: "b", b: "a" })

    assert.equal(await tree.root("a"), undefined)
  })
})
