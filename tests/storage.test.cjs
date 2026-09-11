const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { DocumentStore } = require("../desktop/storage.cjs");
require("node:fs").mkdirSync(".scratch", { recursive: true });
test("session preserves active tab and cursor, and queued stale snapshots cannot resurrect discarded writing", async () => {
  const dir = await fs.mkdtemp(path.resolve(".scratch/session-"));
  const store = new DocumentStore(dir);
  const a = {
    ...store.create(),
    text: "keep",
    active: true,
    selection: { anchor: 2, head: 3 },
    scroll: { top: 42, left: 0 },
  };
  const b = { ...store.create(), text: "discard" };
  await store.recover([a, b]);
  await Promise.all([store.discard(b.id), store.recover([a, b])]);
  const restored = await new DocumentStore(dir).restore();
  assert.equal(restored.length, 1);
  assert.equal(restored[0].active, true);
  assert.deepEqual(restored[0].selection, { anchor: 2, head: 3 });
  assert.equal(restored[0].scroll.top, 42);
});
test("proposed reload does not accept an external fingerprint until acknowledged", async () => {
  const dir = await fs.mkdtemp(path.resolve(".scratch/reload-"));
  try {
    const file = path.join(dir, "note");
    await fs.writeFile(file, "original");
    const store = new DocumentStore();
    const doc = await store.open(file);
    await fs.writeFile(file, "external");
    const candidate = await store.reload(doc.id);
    await assert.rejects(store.save(doc.id, "concurrent edit"), /CONFLICT/);
    store.acceptReload(doc.id, candidate.fingerprint);
    await store.save(doc.id, "accepted edit");
    assert.equal(await fs.readFile(file, "utf8"), "accepted edit");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("Save As aliases retain external-change conflict protection", async () => {
  if (process.platform !== "win32") return;
  const dir = await fs.mkdtemp(path.resolve(".scratch/alias-"));
  try {
    const file = path.join(dir, "note.txt");
    await fs.writeFile(file, "original");
    const store = new DocumentStore();
    const doc = await store.open(file);
    await fs.writeFile(file, "external");
    await assert.rejects(
      store.save(doc.id, "local", file.toUpperCase()),
      /CONFLICT/,
    );
    assert.equal(await fs.readFile(file, "utf8"), "external");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("recovery cannot replace native paths or fingerprints", async () => {
  const dir = await fs.mkdtemp(path.resolve(".scratch/identity-"));
  try {
    const store = new DocumentStore(dir);
    const doc = store.create();
    await store.recover([
      {
        ...doc,
        path: path.join(dir, "other"),
        fingerprint: "forged",
        text: "draft",
      },
    ]);
    const restored = await new DocumentStore(dir).restore();
    assert.equal(restored[0].path, null);
    assert.equal(restored[0].fingerprint, null);
    assert.equal(restored[0].text, "draft");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("unknown extension opens and no-edit save preserves every byte", async () => {
  const dir = await fs.mkdtemp(path.resolve(".scratch/roundtrip-"));
  try {
    const file = path.join(dir, "雪.custom");
    const bytes = Buffer.from("\ufeffhello  \r\nworld\nend\r");
    await fs.writeFile(file, bytes);
    const store = new DocumentStore();
    const doc = await store.open(file);
    await store.save(doc.id, doc.text);
    assert.deepEqual(await fs.readFile(file), bytes);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("discarding one tab preserves another unsaved recovery snapshot", async () => {
  const dir = await fs.mkdtemp(path.resolve(".scratch/discard-"));
  try {
    const store = new DocumentStore(dir);
    const a = store.create(),
      b = store.create();
    await store.recover([{ ...a, text: "keep this draft", dirty: true }, b]);
    await store.discard(b.id);
    assert.equal(
      (await new DocumentStore(dir).restore())[0].text,
      "keep this draft",
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("UTF-16 byte round trips and edits preserve encoding", async () => {
  const iconv = require("iconv-lite");
  const dir = await fs.mkdtemp(path.resolve(".scratch/utf16-"));
  try {
    for (const [encoding, bom] of [
      ["utf16-le", [255, 254]],
      ["utf16-be", [254, 255]],
    ]) {
      const file = path.join(dir, encoding);
      const bytes = Buffer.concat([
        Buffer.from(bom),
        iconv.encode("雪 😀\r\n", encoding),
      ]);
      await fs.writeFile(file, bytes);
      const store = new DocumentStore();
      const doc = await store.open(file);
      await store.save(doc.id, doc.text);
      assert.deepEqual(await fs.readFile(file), bytes);
      await store.save(doc.id, doc.text + "done");
      assert.equal(
        (await new DocumentStore().open(file)).text,
        "雪 😀\r\ndone",
      );
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("binary warning and explicit reversible legacy decoding", async () => {
  const { decode, encode } = require("../desktop/storage.cjs");
  assert.throws(() => decode(Buffer.from([0, 1, 2])), /BINARY/);
  const bytes = Buffer.from([0x63, 0x61, 0x66, 0xe9]);
  assert.throws(() => decode(bytes), /ENCODING/);
  const decoded = decode(bytes, true);
  assert.deepEqual(encode(decoded.text, decoded), bytes);
  assert.throws(() => encode("雪", decoded), /cannot represent/);
});
test("save failure keeps the original and the in-memory source", async () => {
  const dir = await fs.mkdtemp(path.resolve(".scratch/failure-"));
  try {
    const file = path.join(dir, "note");
    await fs.writeFile(file, "original");
    const store = new DocumentStore();
    const doc = await store.open(file);
    await assert.rejects(
      store.save(doc.id, "edit", path.join(dir, "missing", "note")),
    );
    assert.equal((await store.open(file)).text, "original");
    assert.equal(await fs.readFile(file, "utf8"), "original");
    assert.deepEqual(await fs.readdir(dir), ["note"]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("queued saves cannot finish in reverse order", async () => {
  const dir = await fs.mkdtemp(path.resolve(".scratch/queue-"));
  try {
    const file = path.join(dir, "note");
    await fs.writeFile(file, "start");
    const store = new DocumentStore();
    const doc = await store.open(file);
    await Promise.all([
      store.save(doc.id, "first"),
      store.save(doc.id, "last"),
    ]);
    assert.equal(await fs.readFile(file, "utf8"), "last");
    assert.equal((await store.open(file)).id, doc.id);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("plain text never reformats configs, frontmatter, HTML or unsupported constructs", async () => {
  const dir = await fs.mkdtemp(path.resolve(".scratch/plain-"));
  try {
    for (const [name, text] of [
      [".gitignore", "node_modules/  \n"],
      ["config.unknown", '{ "b" : 2, "a": 1 }\r\n'],
      [
        "AGENTS.md",
        '---\r\ntitle: "untouched"\n---\n<script>bad()</script>\n:::custom\nkeep\n:::  ',
      ],
    ]) {
      const file = path.join(dir, name);
      await fs.writeFile(file, text);
      const store = new DocumentStore();
      const doc = await store.open(file);
      await store.save(doc.id, doc.text);
      assert.equal(await fs.readFile(file, "utf8"), text);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("external edits are detected without replacing the external bytes", async () => {
  const dir = await fs.mkdtemp(path.resolve(".scratch/conflict-"));
  try {
    const file = path.join(dir, "note");
    await fs.writeFile(file, "first");
    const store = new DocumentStore();
    const doc = await store.open(file);
    await fs.writeFile(file, "external");
    await assert.rejects(store.save(doc.id, "local"), /CONFLICT/);
    assert.equal(await fs.readFile(file, "utf8"), "external");
    const change = await store.check(doc.id);
    assert.equal(change.changed, true);
    assert.equal(change.text, "external");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("new drafts and recovery survive a new store without flattening line endings", async () => {
  const dir = await fs.mkdtemp(path.resolve(".scratch/recovery-"));
  try {
    const store = new DocumentStore(dir);
    const doc = store.create("markdown");
    await store.recover([{ ...doc, text: "a\r\nb\nc  ", dirty: true }]);
    const next = new DocumentStore(dir);
    const restored = await next.restore();
    assert.equal(restored[0].text, "a\r\nb\nc  ");
    await next.discard(restored[0].id);
    assert.deepEqual(await new DocumentStore(dir).restore(), []);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("dirty named recovery preserves its original conflict baseline across a new session", async () => {
  const dir = await fs.mkdtemp(path.resolve(".scratch/closed-conflict-"));
  const file = path.join(dir, "note.txt");
  await fs.writeFile(file, "original\r\n");
  const store = new DocumentStore(path.join(dir, "recovery"));
  const doc = await store.open(file);
  await store.recover([{ ...doc, text: "unfinished\r\n", dirty: true }]);
  await fs.writeFile(file, "external");
  const next = new DocumentStore(path.join(dir, "recovery"));
  const [restored] = await next.restore();
  assert.equal(restored.text, "unfinished\r\n");
  assert.equal(restored.dirty, true);
  await assert.rejects(next.save(restored.id, restored.text), /CONFLICT/);
  assert.equal(await fs.readFile(file, "utf8"), "external");
});
