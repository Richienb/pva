import test from "ava"
import { lintFile } from "./source/index.js"

test("main", async t => {
	const { version } = await lintFile("./fixtures/basic.yaml")
	t.is(typeof version, "string")
})
