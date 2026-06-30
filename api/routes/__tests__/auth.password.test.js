/**
 * auth.password.test.js — HTTP tests for POST /api/auth/signup and /login.
 *
 * Layer 1 spec:
 *   - signup stores a HASHED (not plaintext) password
 *   - correct creds → session token; wrong → no token + correct Hebrew error
 *   - email already exists → 409 distinct error
 *   - email not found → 401 distinct error
 *
 * In-process express + mocked db pool (mirrors licenseVerify.endpoint.test.js).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.JWT_SECRET = "test-jwt-secret-auth-password";
});

vi.mock("../../db.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import http     from "http";
import express  from "express";
import bcrypt   from "bcryptjs";
import jwt      from "jsonwebtoken";
import { pool } from "../../db.js";
import authRouter from "../../routes/auth.js";

const JWT_SIGN_SECRET = "test-jwt-secret-auth-password";

let server, baseUrl;

beforeAll(() => new Promise((resolve) => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  server = http.createServer(app);
  server.listen(0, "127.0.0.1", () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => vi.clearAllMocks());

function post(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── signup ───────────────────────────────────────────────────────────────────
describe("POST /api/auth/signup", () => {
  it("stores a HASHED password (bcrypt), never plaintext", async () => {
    let insertedHash;
    pool.query.mockImplementation(async (sql, params) => {
      if (/SELECT id FROM users/.test(sql)) return { rows: [] };          // no existing
      if (/INSERT INTO users/.test(sql)) {
        insertedHash = params[1];
        return { rows: [{ id: "new-user-1", role: "user" }] };
      }
      return { rows: [] };
    });

    const res = await post("/api/auth/signup", { email: "New@Example.com", password: "supersecret1" });
    expect(res.status).toBe(200);

    expect(insertedHash).toBeTruthy();
    expect(insertedHash).not.toBe("supersecret1");          // not plaintext
    expect(insertedHash.startsWith("$2")).toBe(true);       // bcrypt format
    expect(await bcrypt.compare("supersecret1", insertedHash)).toBe(true);

    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(jwt.verify(body.token, JWT_SIGN_SECRET).sub).toBe("new-user-1");
    expect(body.user.email).toBe("new@example.com");        // normalized
  });

  it("email already exists → 409 with distinct Hebrew error", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: "existing" }] }); // SELECT finds one
    const res = await post("/api/auth/signup", { email: "dup@example.com", password: "supersecret1" });
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toBe("כתובת המייל כבר רשומה — נסו להתחבר.");
  });

  it("password under 8 chars → 400", async () => {
    const res = await post("/api/auth/signup", { email: "x@example.com", password: "short" });
    expect(res.status).toBe(400);
  });
});

// ── login ────────────────────────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  it("correct creds → session token", async () => {
    const hash = await bcrypt.hash("rightpass1", 10);
    pool.query.mockResolvedValueOnce({ rows: [{ id: "u9", role: "user", password_hash: hash }] });

    const res = await post("/api/auth/login", { email: "u9@example.com", password: "rightpass1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(jwt.verify(body.token, JWT_SIGN_SECRET).sub).toBe("u9");
  });

  it("wrong password → 401, no token", async () => {
    const hash = await bcrypt.hash("rightpass1", 10);
    pool.query.mockResolvedValueOnce({ rows: [{ id: "u9", role: "user", password_hash: hash }] });

    const res = await post("/api/auth/login", { email: "u9@example.com", password: "WRONGpass" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.token).toBeUndefined();
  });

  // Anti-enumeration: non-existent email and wrong password must be indistinguishable.
  it("non-existent email and wrong password → IDENTICAL message and status", async () => {
    const hash = await bcrypt.hash("rightpass1", 10);

    pool.query.mockResolvedValueOnce({ rows: [] }); // email not found
    const noUser = await post("/api/auth/login", { email: "ghost@example.com", password: "whatever1" });

    pool.query.mockResolvedValueOnce({ rows: [{ id: "u9", role: "user", password_hash: hash }] });
    const wrongPw = await post("/api/auth/login", { email: "u9@example.com", password: "WRONGpass" });

    expect(noUser.status).toBe(401);
    expect(wrongPw.status).toBe(noUser.status);

    const a = await noUser.json();
    const b = await wrongPw.json();
    expect(a.error.message).toBe("אימייל או סיסמה שגויים");
    expect(b.error.message).toBe(a.error.message);
  });
});
