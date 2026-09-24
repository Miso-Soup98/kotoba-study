import assert from "node:assert/strict";
const origin = process.env.TEST_ORIGIN || "http://localhost:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw Error("Loopback test only");
const cookie = { Cookie: "__sites_local_auth=1" },
  id = "ted-new-001";
for (const path of [
  "/api/ted",
  `/api/ted/article?id=${id}`,
  `/api/ted/media?id=${id}&kind=audio`,
]) {
  assert.equal((await fetch(origin + path)).status, 401);
  assert.equal(
    (
      await fetch(origin + path, {
        headers: {
          "oai-authenticated-user-id": "spoof",
          "oai-authenticated-user-email": "spoof@invalid.test",
        },
      })
    ).status,
    401,
  );
}
const list = await fetch(origin + "/api/ted", { headers: cookie });
assert.equal(list.status, 200);
assert.ok((await list.json()).articles.some((a) => a.id === id));
const media = await fetch(origin + `/api/ted/media?id=${id}&kind=audio`, {
  headers: { ...cookie, Range: "bytes=0-1" },
});
assert.equal(media.status, 206);
if (media.headers.has("content-length"))
  assert.equal(media.headers.get("content-length"), "2");
assert.match(media.headers.get("content-range"), /^bytes 0-1\/[0-9]+$/);
assert.equal((await media.arrayBuffer()).byteLength, 2);
assert.match(media.headers.get("cache-control"), /private.*no-store/);
const bad = await fetch(origin + `/api/ted/media?id=${id}&kind=audio`, {
  headers: { ...cookie, Range: "bytes=9999999999-" },
});
assert.equal(bad.status, 416);
assert.equal(
  (
    await fetch(origin + `/api/ted/media?id=../../secret&kind=audio`, {
      headers: cookie,
    })
  ).status,
  400,
);
assert.equal(
  (
    await fetch(origin + `/api/ted/import?id=${id}&kind=article`, {
      method: "PUT",
      headers: cookie,
      body: "{}",
    })
  ).status,
  401,
);
const loopId = "tedloop:" + crypto.randomUUID(),
  makeEvent = (value) => ({
    id: crypto.randomUUID(),
    kind: "ted_loop",
    entity: loopId,
    value,
    at: Date.now(),
  });
const loop = {
  articleId: id,
  label: "API循环测试",
  color: 1,
  start: 1.2,
  end: 3.4,
};
const post = (events) =>
  fetch(origin + "/api/sync", {
    method: "POST",
    headers: { ...cookie, "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ accountId: "local_seedy", cursor: 0, events }),
  });
const first = makeEvent(JSON.stringify(loop));
assert.equal((await post([first])).status, 200);
assert.equal((await post([first])).status, 200);
const second = await (await post([])).json();
assert.equal(second.events.filter((e) => e.id === first.id).length, 1);
assert.equal(
  (await post([makeEvent(JSON.stringify({ ...loop, end: 0 }))])).status,
  400,
);
assert.equal((await post([makeEvent(null)])).status, 200);
console.log(
  "PASS: private catalog/text/media auth, spoof rejection, seek Range, private cache headers, import authorization, loop retry/sync/removal/validation.",
);
