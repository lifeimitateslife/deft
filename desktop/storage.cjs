const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const iconv = require("iconv-lite");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const MAX_BYTES = 32 * 1024 * 1024;
function decode(bytes, force = false) {
  let encoding = "utf8",
    bom = 0;
  if (bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]))) bom = 3;
  else if (bytes.subarray(0, 2).equals(Buffer.from([255, 254]))) {
    encoding = "utf16-le";
    bom = 2;
  } else if (bytes.subarray(0, 2).equals(Buffer.from([254, 255]))) {
    encoding = "utf16-be";
    bom = 2;
  }
  const body = bytes.subarray(bom);
  let text = iconv.decode(body, encoding);
  if (!iconv.encode(text, encoding).equals(body)) {
    if (!force)
      throw new Error(
        "ENCODING: This file is not valid UTF-8 or BOM-marked UTF-16. Open as text anyway uses reversible Windows-1252.",
      );
    encoding = "windows1252";
    bom = 0;
    text = iconv.decode(bytes, encoding);
    if (!iconv.encode(text, encoding).equals(bytes))
      throw new Error("This encoding cannot be opened without losing bytes.");
  }
  if (!force && /[\x00-\x08\x0e-\x1f]/.test(text))
    throw new Error("BINARY: This file appears to contain binary data.");
  return { text, encoding, bom: bytes.subarray(0, bom).toString("base64") };
}
function encode(text, doc) {
  const body = iconv.encode(text, doc.encoding);
  if (iconv.decode(body, doc.encoding) !== text)
    throw new Error(
      "The original encoding cannot represent these characters. Save a UTF-8 copy instead.",
    );
  return Buffer.concat([Buffer.from(doc.bom, "base64"), body]);
}
class DocumentStore {
  constructor(recoveryDir) {
    this.docs = new Map();
    this.queue = Promise.resolve();
    this.recoveryDir = recoveryDir;
    this.reloads = new Map();
  }
  create(kind = "text") {
    const doc = {
      id: randomUUID(),
      path: null,
      name: kind === "markdown" ? "Untitled.md" : "Untitled",
      kind,
      text: "",
      encoding: "utf8",
      bom: "",
      fingerprint: null,
      readOnly: false,
    };
    this.docs.set(doc.id, doc);
    return { ...doc };
  }
  async recover(drafts) {
    if (!this.recoveryDir) return;
    if (!Array.isArray(drafts) || drafts.length > 100)
      throw new Error("Recovery supports up to 100 open documents.");
    const snapshots = drafts.map((draft) => {
      const native = this.docs.get(draft.id);
      if (!native || typeof draft.text !== "string")
        throw new Error("Invalid recovery document.");
      return {
        ...native,
        text: draft.text,
        dirty: !!draft.dirty,
        kind: ["text", "markdown"].includes(draft.kind)
          ? draft.kind
          : native.kind,
        mode: ["live", "source", "read"].includes(draft.mode)
          ? draft.mode
          : "source",
        readOnly: !!draft.readOnly,
      };
    });
    const value = JSON.stringify(snapshots);
    if (Buffer.byteLength(value) > 64 * 1024 * 1024)
      throw new Error(
        "Recovery is full (64 MiB). Save or close some documents.",
      );
    await this.serialize(async () => {
      await fs.mkdir(this.recoveryDir, { recursive: true });
      await safeWrite(
        path.join(this.recoveryDir, "session.json"),
        Buffer.from(value),
      );
    });
  }
  async restore() {
    if (!this.recoveryDir) return [];
    let drafts;
    try {
      drafts = JSON.parse(
        await fs.readFile(path.join(this.recoveryDir, "session.json"), "utf8"),
      );
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw new Error(
        "Recovery could not be read. The existing snapshot has been retained.",
      );
    }
    if (!Array.isArray(drafts) || drafts.length > 100)
      throw new Error("Invalid recovery snapshot.");
    for (const doc of drafts) {
      if (
        typeof doc.id !== "string" ||
        !/^[0-9a-f-]{36}$/.test(doc.id) ||
        typeof doc.text !== "string" ||
        (doc.path !== null &&
          (typeof doc.path !== "string" || !path.isAbsolute(doc.path))) ||
        !["utf8", "utf16-le", "utf16-be", "windows1252"].includes(
          doc.encoding,
        ) ||
        !["", "77u/", "//4=", "/v8="].includes(doc.bom) ||
        (doc.fingerprint !== null && !/^[0-9a-f]{64}$/.test(doc.fingerprint))
      )
        throw new Error("Invalid recovery snapshot. Existing data retained.");
    }
    for (const doc of drafts) this.docs.set(doc.id, { ...doc });
    return drafts;
  }
  async discard(id) {
    this.docs.delete(id);
    if (!this.recoveryDir) return;
    let snapshots = [];
    try {
      snapshots = JSON.parse(
        await fs.readFile(path.join(this.recoveryDir, "session.json"), "utf8"),
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    await this.recover(snapshots.filter((doc) => doc.id !== id));
  }
  async check(id) {
    const doc = this.docs.get(id);
    if (!doc?.path) return { changed: false };
    try {
      const stat = await fs.stat(doc.path);
      if (stat.size > MAX_BYTES)
        return {
          changed: true,
          error: "External file exceeds the editing limit.",
        };
      const bytes = await fs.readFile(doc.path);
      if (hash(bytes) === doc.fingerprint) return { changed: false };
      return { changed: true, ...decode(bytes), fingerprint: hash(bytes) };
    } catch (e) {
      return {
        changed: true,
        error: e.code === "ENOENT" ? "File was moved or deleted." : e.message,
      };
    }
  }
  async reload(id) {
    const update = await this.check(id);
    if (update.error) throw new Error(update.error);
    const doc = this.docs.get(id);
    const candidate = { ...doc, ...(update.changed ? update : {}) };
    this.reloads.set(id, candidate);
    return candidate;
  }
  acceptReload(id, fingerprint) {
    const candidate = this.reloads.get(id);
    if (!candidate || candidate.fingerprint !== fingerprint)
      throw new Error("Reload expired. Check the file again.");
    Object.assign(this.docs.get(id), candidate);
    this.reloads.delete(id);
  }
  async open(file, force = false) {
    const target = await fs.realpath(file);
    const existing = [...this.docs.values()].find((d) => d.path === target);
    if (existing) return { ...existing };
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw new Error("Choose a regular file.");
    if (stat.size > MAX_BYTES)
      throw new Error("This file exceeds the 32 MiB editing limit.");
    const bytes = await fs.readFile(target);
    const decoded = decode(bytes, force);
    const doc = {
      id: randomUUID(),
      path: target,
      name: path.basename(file),
      ...decoded,
      fingerprint: hash(bytes),
      readOnly: !(stat.mode & 0o200),
    };
    this.docs.set(doc.id, doc);
    return { ...doc };
  }
  save(id, text, destination) {
    return this.serialize(async () => {
      const doc = this.docs.get(id);
      if (!doc) throw new Error("Document is no longer open.");
      let target = destination ? path.resolve(destination) : doc.path;
      if (!target) throw new Error("Choose a save location.");
      try {
        target = await fs.realpath(target);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      const bytes = encode(text, doc);
      if (target === doc.path) {
        const current = await fs.readFile(target);
        if (hash(current) !== doc.fingerprint)
          throw new Error(
            "CONFLICT: The file changed outside DEFT. Reload or save a copy.",
          );
        if (bytes.equals(current)) return { ...doc };
      }
      await safeWrite(
        target,
        bytes,
        target === doc.path ? doc.fingerprint : undefined,
      );
      Object.assign(doc, {
        path: await fs.realpath(target),
        name: path.basename(target),
        text,
        fingerprint: hash(bytes),
      });
      return { ...doc };
    });
  }
  serialize(work) {
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result;
  }
}
async function safeWrite(file, bytes, expected) {
  let target = file,
    stat;
  try {
    target = await fs.realpath(file);
    stat = await fs.stat(target);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (stat && !(stat.mode & 0o200))
    throw new Error("This file is read-only. Save a copy.");
  const temp = path.join(path.dirname(target), `.deft-${randomUUID()}.tmp`);
  try {
    const handle = await fs.open(temp, "wx", stat?.mode ?? 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (expected && hash(await fs.readFile(target)) !== expected)
      throw new Error("CONFLICT: File changed during save.");
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
module.exports = { DocumentStore, decode, encode, safeWrite, hash, MAX_BYTES };
