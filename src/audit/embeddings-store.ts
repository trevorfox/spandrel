/**
 * Embedding store — SQLite-backed per-node embedding cache.
 *
 * Phase E1 (spec: `specs/2026-05-11-phase-e1-missing-link-detection.md`).
 *
 * Each compiled graph keeps its own embedding cache at
 * `<graph-root>/_audit/embeddings.db`. The store is content-addressed by
 * `(path, content_hash, model)` so swapping the embedding model or editing a
 * node's text both invalidate the cached row. Re-embedding only re-fires when
 * `content_hash` changes; this is the cost-control mechanism that makes the
 * `spandrel embed` subcommand idempotent.
 *
 * Schema:
 *
 * ```sql
 * CREATE TABLE node_embeddings (
 *   path           TEXT NOT NULL,
 *   content_hash   TEXT NOT NULL,
 *   model          TEXT NOT NULL,
 *   dim            INTEGER NOT NULL,
 *   embedding      BLOB NOT NULL,
 *   computed_at    TEXT NOT NULL,
 *   PRIMARY KEY (path, content_hash, model)
 * );
 * CREATE INDEX node_embeddings_path ON node_embeddings (path);
 * ```
 *
 * Embeddings are packed as native-endian Float32 buffers. v1 uses no
 * `sqlite-vec` extension — at < ~10k nodes, an in-memory cosine sweep is
 * faster than the round-trip to a vector index.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import type { SpandrelNode } from "../compiler/types.js";

/**
 * Compute a stable content-hash for a node — sha256 over the same
 * `name + "\n\n" + description + "\n\n" + body` blob that the embedding
 * provider will embed. Used as the cache key so a no-op edit to body or
 * frontmatter both invalidate the cached row.
 *
 * Note: `node.content` in the compiler is the post-frontmatter body; that's
 * what the embedding provider also uses. Keeping the inputs identical between
 * `computeContentHash` and the provider is load-bearing — divergence would
 * silently cause cache misses on every embed pass.
 */
export function computeContentHash(node: SpandrelNode): string {
  const body = node.content ?? "";
  const payload = `${node.name}\n\n${node.description}\n\n${body}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * One row in the embeddings table.
 */
export interface EmbeddingRow {
  path: string;
  contentHash: string;
  model: string;
  dim: number;
  embedding: Float32Array;
  computedAt: string;
}

/**
 * Handle for an open embedding store. Operations are synchronous (better-sqlite3
 * is synchronous; the caller is the CLI which orchestrates async I/O around it).
 */
export interface EmbeddingsStore {
  /**
   * Return the embedding row for `(path, contentHash, model)`, or null if
   * absent. Used by `spandrel embed` to skip nodes whose content hasn't changed.
   */
  get(path: string, contentHash: string, model: string): EmbeddingRow | null;
  /**
   * Insert or replace a row. Idempotent — re-running with the same key is a
   * no-op-shaped overwrite.
   */
  upsert(
    path: string,
    contentHash: string,
    model: string,
    dim: number,
    embedding: Float32Array,
    computedAt: string,
  ): void;
  /**
   * Return every embedding currently stored for `model`, keyed by `path`. Used
   * by `findMissingLinks` to build the in-memory similarity index. When
   * multiple rows exist for the same `path` (because of stale content_hash
   * rows from earlier runs), the most-recent `computed_at` wins.
   */
  getAllForGraph(model: string): Map<string, Float32Array>;
  /**
   * Return every content-hash currently cached for `model`, keyed by path. Used
   * by the audit CLI to detect "stale store" (a node's current hash isn't yet
   * embedded) before running semantic detectors.
   */
  getAllHashesForGraph(model: string): Map<string, string>;
  /**
   * Return every distinct model name with at least one row in the store.
   * Used by `spandrel audit --semantic` to auto-detect which model to read
   * when `--semantic-model` isn't passed — if exactly one is present, that's
   * the obvious choice; if multiple, the caller errors out and asks the
   * user to disambiguate.
   */
  getDistinctModels(): string[];
  /**
   * Total row count, for diagnostics.
   */
  count(): number;
  /**
   * Close the underlying database handle. After this, every method throws.
   */
  close(): void;
}

/**
 * Encode a Float32Array as a Buffer view over the same memory — zero-copy when
 * the array is plain Float32Array. SQLite stores BLOBs verbatim; the byte order
 * matches the host machine, which is fine because the store is local-only.
 */
function encodeEmbedding(embedding: Float32Array): Buffer {
  return Buffer.from(
    embedding.buffer,
    embedding.byteOffset,
    embedding.byteLength,
  );
}

/**
 * Decode a BLOB into a Float32Array. The blob is the packed-bytes view of a
 * Float32Array (4 bytes per entry); we slice into a new ArrayBuffer so the
 * caller owns the memory and SQLite is free to recycle its row buffer.
 */
function decodeEmbedding(blob: Buffer, dim: number): Float32Array {
  if (blob.byteLength !== dim * 4) {
    throw new Error(
      `embedding blob byteLength=${blob.byteLength} doesn't match dim=${dim} (expected ${dim * 4})`,
    );
  }
  const ab = new ArrayBuffer(blob.byteLength);
  new Uint8Array(ab).set(blob);
  return new Float32Array(ab);
}

/**
 * Open or create the embedding store for `graphRoot`. The DB lives at
 * `<graphRoot>/_audit/embeddings.db`; the parent dir is created if missing.
 * Migrations run on every open (idempotent CREATE IF NOT EXISTS).
 *
 * `opts.dbPath` overrides the default location — useful for tests that don't
 * want to materialize a graph root just to exercise the store.
 */
export function openStore(
  graphRoot: string,
  opts?: { dbPath?: string },
): EmbeddingsStore {
  const dbPath =
    opts?.dbPath ?? path.join(graphRoot, "_audit", "embeddings.db");
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db: DatabaseType = new Database(dbPath);
  // WAL gives concurrent reads while a writer is open. Embedding pass is
  // single-process today, so this is mainly defense against an editor process
  // reading the store while `spandrel embed` is running.
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS node_embeddings (
      path           TEXT NOT NULL,
      content_hash   TEXT NOT NULL,
      model          TEXT NOT NULL,
      dim            INTEGER NOT NULL,
      embedding      BLOB NOT NULL,
      computed_at    TEXT NOT NULL,
      PRIMARY KEY (path, content_hash, model)
    );
    CREATE INDEX IF NOT EXISTS node_embeddings_path
      ON node_embeddings (path);
  `);

  const getStmt = db.prepare(`
    SELECT path, content_hash AS contentHash, model, dim, embedding, computed_at AS computedAt
      FROM node_embeddings
     WHERE path = ? AND content_hash = ? AND model = ?
  `);

  const upsertStmt = db.prepare(`
    INSERT OR REPLACE INTO node_embeddings
      (path, content_hash, model, dim, embedding, computed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Pick the latest computed_at per path for a given model — eliminates stale
  // rows from previous content-hash generations. Without this filter, the
  // similarity sweep would see multiple embeddings per node.
  const allForGraphStmt = db.prepare(`
    SELECT path, dim, embedding
      FROM node_embeddings ne
     WHERE model = ?
       AND computed_at = (
         SELECT MAX(computed_at)
           FROM node_embeddings
          WHERE path = ne.path AND model = ne.model
       )
  `);

  const allHashesStmt = db.prepare(`
    SELECT path, content_hash AS contentHash
      FROM node_embeddings ne
     WHERE model = ?
       AND computed_at = (
         SELECT MAX(computed_at)
           FROM node_embeddings
          WHERE path = ne.path AND model = ne.model
       )
  `);

  const countStmt = db.prepare(
    `SELECT COUNT(*) AS n FROM node_embeddings`,
  );

  const distinctModelsStmt = db.prepare(
    `SELECT DISTINCT model FROM node_embeddings ORDER BY model`,
  );

  return {
    get(p, hash, model) {
      const row = getStmt.get(p, hash, model) as
        | (Omit<EmbeddingRow, "embedding"> & { embedding: Buffer })
        | undefined;
      if (!row) return null;
      return {
        path: row.path,
        contentHash: row.contentHash,
        model: row.model,
        dim: row.dim,
        embedding: decodeEmbedding(row.embedding, row.dim),
        computedAt: row.computedAt,
      };
    },
    upsert(p, hash, model, dim, embedding, computedAt) {
      if (embedding.length !== dim) {
        throw new Error(
          `upsert: embedding length=${embedding.length} doesn't match dim=${dim}`,
        );
      }
      upsertStmt.run(p, hash, model, dim, encodeEmbedding(embedding), computedAt);
    },
    getAllForGraph(model) {
      const rows = allForGraphStmt.all(model) as Array<{
        path: string;
        dim: number;
        embedding: Buffer;
      }>;
      const out = new Map<string, Float32Array>();
      for (const r of rows) {
        out.set(r.path, decodeEmbedding(r.embedding, r.dim));
      }
      return out;
    },
    getAllHashesForGraph(model) {
      const rows = allHashesStmt.all(model) as Array<{
        path: string;
        contentHash: string;
      }>;
      const out = new Map<string, string>();
      for (const r of rows) {
        out.set(r.path, r.contentHash);
      }
      return out;
    },
    getDistinctModels() {
      const rows = distinctModelsStmt.all() as Array<{ model: string }>;
      return rows.map((r) => r.model);
    },
    count() {
      const row = countStmt.get() as { n: number };
      return row.n;
    },
    close() {
      db.close();
    },
  };
}
