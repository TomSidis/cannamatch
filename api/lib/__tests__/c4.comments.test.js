/**
 * C4.4 — Community Comments endpoints
 *
 * Pattern: http.createServer + native fetch + pool.query mock (no transactions).
 *
 * Test categories:
 *   A. Filter rejection       — external link / sales / phone → 400 with reason
 *   B. Clean comment          — passes filter → 201, no user_id in response
 *   C. XSS sanitization       — <script> tags stripped before storage
 *   D. Single-level threading — reply-to-reply → 400; reply-to-root → 201
 *   E. Parent not found       — parent_id for wrong review → 404
 *   F. Review not found       — FK violation on INSERT → 404
 *   G. GET comments           — threaded structure, no user_id
 *   H. DELETE own comment     — 204
 *   I. DELETE ownership guard — other user's or non-existent → 404, same body
 *   J. INSERT schema check    — user_id in params (ownership); body is sanitized
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import http    from "http";
import express from "express";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../security/claudeProxyShield.js", () => ({
  verifySession: (req, _res, next) => { req.userId = "user-c4-comment"; next(); },
}));

vi.mock("../../db.js", () => ({
  pool: { query: vi.fn() },
}));

import { pool } from "../../db.js";
import feedRouter from "../../routes/feed.js";

// ── HTTP server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;

beforeAll(() =>
  new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    app.use("/api", feedRouter);
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  }),
);

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => vi.clearAllMocks());

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REVIEW_ID  = "review-c4";
const COMMENT_ID = "comment-c4";

const ROOT_COMMENT = {
  id: COMMENT_ID, parent_id: null,
  body: "עזר לי מאוד", created_at: "2026-06-26T10:00:00Z",
};

const REPLY_COMMENT = {
  id: "reply-c4", parent_id: COMMENT_ID,
  body: "אני מסכים", created_at: "2026-06-26T10:05:00Z",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function postComment(reviewId, body, parentId = undefined) {
  const payload = parentId ? { body, parent_id: parentId } : { body };
  return fetch(`${baseUrl}/api/feed/${reviewId}/comments`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
}

function getComments(reviewId) {
  return fetch(`${baseUrl}/api/feed/${reviewId}/comments`);
}

function deleteComment(reviewId, cid) {
  return fetch(`${baseUrl}/api/feed/${reviewId}/comments/${cid}`, { method: "DELETE" });
}

// Mock for a successful POST flow (no parent_id)
function mockSuccessfulInsert(returnedComment = ROOT_COMMENT) {
  pool.query.mockResolvedValueOnce({ rows: [returnedComment] }); // INSERT RETURNING
}

// Mock for a reply flow: parent lookup succeeds (root comment), then INSERT
function mockReplyInsert(parentRow = { id: COMMENT_ID, parent_id: null }) {
  pool.query
    .mockResolvedValueOnce({ rows: [parentRow] })               // parent SELECT
    .mockResolvedValueOnce({ rows: [REPLY_COMMENT] });          // INSERT RETURNING
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Filter rejection
// ═══════════════════════════════════════════════════════════════════════════════

describe("A — comment filter: rejections return 400 with reason", () => {
  it("A1 — external link → 400, reason=external_link", async () => {
    const res  = await postComment(REVIEW_ID, "ראה http://spam.com");
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.reason).toBe("external_link");
  });

  it("A2 — sales keyword → 400, reason=sales", async () => {
    const res = await postComment(REVIEW_ID, "זן זה למכירה");
    expect(res.status).toBe(400);
    expect((await res.json()).error.reason).toBe("sales");
  });

  it("A3 — phone number → 400, reason=sales", async () => {
    const res = await postComment(REVIEW_ID, "התקשרו 052-123-4567");
    expect(res.status).toBe(400);
    expect((await res.json()).error.reason).toBe("sales");
  });

  it("A4 — filter rejection does NOT call pool.query (no DB write)", async () => {
    await postComment(REVIEW_ID, "https://spam.com");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("A5 — empty body → 400", async () => {
    const res = await postComment(REVIEW_ID, "");
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Clean comment — passes filter → 201, anonymous response
// ═══════════════════════════════════════════════════════════════════════════════

describe("B — clean comment: 201 with anonymous response", () => {
  it("B1 — returns 201 with id, body, created_at", async () => {
    mockSuccessfulInsert();
    const res  = await postComment(REVIEW_ID, "עזר לי מאוד");
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.id).toBe(COMMENT_ID);
    expect(typeof body.body).toBe("string");
    expect(typeof body.created_at).toBe("string");
  });

  it("B2 — response has no user_id", async () => {
    mockSuccessfulInsert({ ...ROOT_COMMENT, user_id: "should-never-appear" });
    const body = await (await postComment(REVIEW_ID, "עזר לי מאוד")).json();
    expect(body).not.toHaveProperty("user_id");
  });

  it("B3 — response shape: only id, parent_id, body, created_at", async () => {
    mockSuccessfulInsert();
    const body = await (await postComment(REVIEW_ID, "עזר לי מאוד")).json();
    const keys = Object.keys(body).sort();
    expect(keys).toEqual(["body", "created_at", "id", "parent_id"].sort());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. XSS sanitization
// ═══════════════════════════════════════════════════════════════════════════════

describe("C — XSS: script tags stripped before INSERT", () => {
  it("C1 — <script> chars removed; rest of body preserved", async () => {
    let capturedBody = null;
    pool.query.mockImplementation(async (sql, params) => {
      if (/INSERT INTO review_comments/.test(sql)) {
        capturedBody = params[3]; // $4 = body
        return { rows: [{ ...ROOT_COMMENT, body: capturedBody }] };
      }
      return { rows: [] };
    });

    await postComment(REVIEW_ID, '<script>alert(1)</script>תגובה נקייה');

    expect(capturedBody).not.toMatch(/<|>/);
    expect(capturedBody).toContain("תגובה נקייה");
  });

  it("C2 — double-quotes and backticks stripped", async () => {
    let capturedBody = null;
    pool.query.mockImplementation(async (sql, params) => {
      if (/INSERT INTO review_comments/.test(sql)) {
        capturedBody = params[3];
        return { rows: [{ ...ROOT_COMMENT, body: capturedBody }] };
      }
      return { rows: [] };
    });

    await postComment(REVIEW_ID, 'test"injection`attempt');

    expect(capturedBody).not.toMatch(/["'`]/);
  });

  it("C3 — user_id is in INSERT params (ownership requires it)", async () => {
    let capturedUserId = null;
    pool.query.mockImplementation(async (sql, params) => {
      if (/INSERT INTO review_comments/.test(sql)) {
        capturedUserId = params[1]; // $2 = user_id
        return { rows: [ROOT_COMMENT] };
      }
      return { rows: [] };
    });

    await postComment(REVIEW_ID, "תגובה תקינה");
    expect(capturedUserId).toBe("user-c4-comment");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Single-level threading
// ═══════════════════════════════════════════════════════════════════════════════

describe("D — single-level threading enforcement (application layer)", () => {
  it("D1 — reply to a root comment → 201", async () => {
    mockReplyInsert();
    const res = await postComment(REVIEW_ID, "אני מסכים", COMMENT_ID);
    expect(res.status).toBe(201);
  });

  it("D2 — reply to a reply (depth=2) → 400", async () => {
    // Parent lookup returns a comment that itself has a parent_id (is a reply)
    pool.query.mockResolvedValueOnce({ rows: [{ id: "reply-id", parent_id: COMMENT_ID }] });
    const res  = await postComment(REVIEW_ID, "רוצה להגיב לתגובה", "reply-id");
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.message).toMatch(/לא ניתן להגיב/);
  });

  it("D3 — parent_id lookup validates review_id ownership (same review)", async () => {
    const queries = [];
    pool.query.mockImplementation(async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [{ id: COMMENT_ID, parent_id: null }] };
    });

    await postComment(REVIEW_ID, "תגובה", COMMENT_ID);

    const parentQuery = queries.find(q => /FROM review_comments/.test(q.sql));
    // Must pass review_id as second param to prevent cross-review parent injection
    expect(parentQuery?.params).toContain(REVIEW_ID);
  });

  it("D4 — no parent_id → root comment, no parent SELECT issued", async () => {
    const queries = [];
    pool.query.mockImplementation(async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [ROOT_COMMENT] };
    });

    await postComment(REVIEW_ID, "תגובה שורש");

    const parentSelect = queries.find(q => /FROM review_comments/.test(q.sql) && !/INSERT/.test(q.sql));
    expect(parentSelect).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Parent not found
// ═══════════════════════════════════════════════════════════════════════════════

describe("E — parent not found or wrong review → 404", () => {
  it("E1 — parent_id not found in this review → 404", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // parent not found
    const res = await postComment(REVIEW_ID, "תגובה", "wrong-parent");
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toMatch(/הורה/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Review not found (FK violation on INSERT)
// ═══════════════════════════════════════════════════════════════════════════════

describe("F — review not found (FK violation) → 404", () => {
  it("F1 — FK violation on INSERT → 404", async () => {
    const fkErr = Object.assign(new Error("fk"), { code: "23503" });
    pool.query.mockRejectedValueOnce(fkErr);
    const res = await postComment("no-such-review", "תגובה");
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. GET /feed/:id/comments — threaded structure, no user_id
// ═══════════════════════════════════════════════════════════════════════════════

describe("G — GET comments: threaded structure, anonymous", () => {
  it("G1 — returns { comments } array", async () => {
    pool.query.mockResolvedValueOnce({ rows: [ROOT_COMMENT, REPLY_COMMENT] });
    const res  = await getComments(REVIEW_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(body.comments)).toBe(true);
  });

  it("G2 — root comment has replies array containing the reply", async () => {
    pool.query.mockResolvedValueOnce({ rows: [ROOT_COMMENT, REPLY_COMMENT] });
    const { comments } = await (await getComments(REVIEW_ID)).json();
    const root = comments.find(c => c.id === COMMENT_ID);
    expect(root).toBeDefined();
    expect(Array.isArray(root.replies)).toBe(true);
    expect(root.replies[0].id).toBe(REPLY_COMMENT.id);
  });

  it("G3 — reply does not appear at root level", async () => {
    pool.query.mockResolvedValueOnce({ rows: [ROOT_COMMENT, REPLY_COMMENT] });
    const { comments } = await (await getComments(REVIEW_ID)).json();
    const rootIds = comments.map(c => c.id);
    expect(rootIds).not.toContain(REPLY_COMMENT.id);
  });

  it("G4 — no user_id in any root comment or reply", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { ...ROOT_COMMENT,  user_id: "u1" },
        { ...REPLY_COMMENT, user_id: "u2" },
      ],
    });
    const { comments } = await (await getComments(REVIEW_ID)).json();
    for (const c of comments) {
      expect(c).not.toHaveProperty("user_id");
      for (const r of (c.replies ?? [])) {
        expect(r).not.toHaveProperty("user_id");
      }
    }
  });

  it("G5 — empty review has empty comments array", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const { comments } = await (await getComments(REVIEW_ID)).json();
    expect(comments).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. DELETE own comment → 204
// ═══════════════════════════════════════════════════════════════════════════════

describe("H — DELETE own comment: 204", () => {
  it("H1 — returns 204 when comment belongs to user", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1 }); // DELETE matched
    const res = await deleteComment(REVIEW_ID, COMMENT_ID);
    expect(res.status).toBe(204);
  });

  it("H2 — DELETE SQL targets review_comments with both id AND user_id", async () => {
    let capturedSql = "";
    let capturedParams = [];
    pool.query.mockImplementation(async (sql, params) => {
      capturedSql    = sql;
      capturedParams = params;
      return { rowCount: 1 };
    });

    await deleteComment(REVIEW_ID, COMMENT_ID);

    expect(capturedSql).toMatch(/DELETE FROM review_comments/);
    expect(capturedParams).toContain(COMMENT_ID);
    expect(capturedParams).toContain("user-c4-comment");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. DELETE ownership guard — 404, same body regardless
// ═══════════════════════════════════════════════════════════════════════════════

describe("I — DELETE ownership guard: 404 (not 403), no info leak", () => {
  it("I1 — other user's comment → 404", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0 }); // WHERE id=x AND user_id=y → no match
    const res = await deleteComment(REVIEW_ID, "other-users-comment");
    expect(res.status).toBe(404);
  });

  it("I2 — non-existent comment → 404", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0 });
    const res = await deleteComment(REVIEW_ID, "nonexistent-comment");
    expect(res.status).toBe(404);
  });

  it("I3 — I1 and I2 return identical body (no info leak)", async () => {
    pool.query.mockResolvedValue({ rowCount: 0 });

    const r1 = await (await deleteComment(REVIEW_ID, "other-users")).json();
    const r2 = await (await deleteComment(REVIEW_ID, "nonexistent")).json();
    expect(r1).toEqual(r2);
  });
});
