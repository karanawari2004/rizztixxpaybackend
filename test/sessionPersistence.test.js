const assert = require("node:assert/strict");
const { test } = require("node:test");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const express = require("express");

process.env.NODE_ENV = "test";

const Account = require("../model/Account");
const Session = require("../model/Session");
const {
  clearAuthCookie,
  hashSessionId,
  setAuthCookie,
} = require("../utils/authCookie");
const authenticateSession = require("../middleware/authenticateSession");

test("session cookie is backed by a hashed MongoDB session", async () => {
  const originalCreate = Session.create;
  const originalFindOne = Session.findOne;
  const originalFindById = Account.findById;
  const records = [];
  const account = {
    _id: { toString: () => "account-123" },
    username: "admin",
    role: "admin",
  };
  let cookie;
  let cookieOptions;
  const clearedCookies = [];

  Session.create = async (record) => {
    records.push(record);
    return record;
  };
  Session.findOne = async (query) =>
    records.find(
      (record) =>
        record.tokenId === query.tokenId &&
        record.expiresAt > query.expiresAt.$gt
    ) || null;
  Account.findById = async (id) =>
    String(id) === account._id.toString() ? account : null;

  try {
    await setAuthCookie(
      {
        cookie: (name, value, options) => {
          assert.equal(name, "session_id");
          cookie = value;
          cookieOptions = options;
        },
        clearCookie: (name) => {
          clearedCookies.push(name);
        },
      },
      account
    );

    assert.match(cookie, /^[a-f0-9]{64}$/);
    assert.equal(records.length, 1);
    assert.equal(records[0].tokenId, hashSessionId(cookie));
    assert.notEqual(records[0].tokenId, cookie);
    assert.equal(records[0].accountId, account._id);
    assert.ok(records[0].expiresAt > new Date());
    assert.equal(cookieOptions.httpOnly, true);
    assert.equal(cookieOptions.sameSite, "lax");
    assert.equal(cookieOptions.path, "/");
    assert.equal(cookieOptions.maxAge, 8 * 60 * 60 * 1000);
    assert.deepEqual(clearedCookies, ["session_id", "access_token"]);

    const req = { cookies: { session_id: cookie } };
    const res = {
      statusCode: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
      },
      clearCookie() {},
    };
    let nextCalled = false;

    await authenticateSession(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(req.user, {
      id: "account-123",
      username: "admin",
      role: "admin",
    });
    assert.equal(req.sessionTokenId, hashSessionId(cookie));
  } finally {
    Session.create = originalCreate;
    Session.findOne = originalFindOne;
    Account.findById = originalFindById;
  }
});

test("missing and unknown session cookies are rejected", async () => {
  const originalFindOne = Session.findOne;
  Session.findOne = async () => null;

  const makeResponse = () => ({
    statusCode: null,
    clearedCookies: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
    clearCookie(name) {
      this.clearedCookies.push(name);
    },
  });

  try {
    const missingRes = makeResponse();
    let missingNextCalled = false;

    await authenticateSession({ cookies: {} }, missingRes, () => {
      missingNextCalled = true;
    });

    assert.equal(missingNextCalled, false);
    assert.equal(missingRes.statusCode, 401);
    assert.equal(missingRes.body.message, "Please log in");

    const invalidRes = makeResponse();
    let invalidNextCalled = false;

    await authenticateSession(
      { cookies: { session_id: "a".repeat(64) } },
      invalidRes,
      () => {
        invalidNextCalled = true;
      }
    );

    assert.equal(invalidNextCalled, false);
    assert.equal(invalidRes.statusCode, 401);
    assert.equal(invalidRes.body.message, "Session expired. Please log in again");
    assert.deepEqual(invalidRes.clearedCookies, ["session_id", "access_token"]);
  } finally {
    Session.findOne = originalFindOne;
  }
});

test("clearing auth cookies removes both session and legacy JWT cookies", () => {
  const cleared = [];
  clearAuthCookie({
    clearCookie(name, options) {
      cleared.push({ name, options });
    },
  });

  assert.deepEqual(
    cleared.map(({ name }) => name),
    ["session_id", "access_token"]
  );
  assert.ok(cleared.every(({ options }) => options.path === "/"));
});

test("login, session lookup, and logout use the server-side session", async () => {
  const originals = {
    accountFindOne: Account.findOne,
    accountFindById: Account.findById,
    sessionCreate: Session.create,
    sessionFindOne: Session.findOne,
    sessionDeleteOne: Session.deleteOne,
  };
  const account = {
    _id: { toString: () => "account-flow-test" },
    username: "admin",
    role: "admin",
    passwordHash: await bcrypt.hash("correct-password", 4),
  };
  const records = [];
  let server;

  Account.findOne = async (query) =>
    query.username === account.username ? account : null;
  Account.findById = async (id) =>
    String(id) === account._id.toString() ? account : null;
  Session.create = async (record) => {
    records.push(record);
    return record;
  };
  Session.findOne = async (query) =>
    records.find(
      (record) =>
        record.tokenId === query.tokenId &&
        record.expiresAt > query.expiresAt.$gt
    ) || null;
  Session.deleteOne = async (query) => {
    const index = records.findIndex(
      (record) => record.tokenId === query.tokenId
    );
    if (index >= 0) {
      records.splice(index, 1);
    }
    return { deletedCount: index >= 0 ? 1 : 0 };
  };

  try {
    const app = express();
    app.use(express.json(), cookieParser(), require("../Router/loginRouter"));
    server = await new Promise((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const login = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "ADMIN",
        password: "correct-password",
      }),
    });
    assert.equal(login.status, 200);
    assert.deepEqual((await login.json()).user, {
      username: "admin",
      role: "admin",
    });
    const setCookie = login.headers.get("set-cookie") || "";
    const sessionId = setCookie.match(/session_id=([a-f0-9]{64})/)?.[1];
    assert.ok(sessionId);

    const session = await fetch(`${baseUrl}/session`, {
      headers: { Cookie: `session_id=${sessionId}` },
    });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).user.username, "admin");

    const logout = await fetch(`${baseUrl}/logout`, {
      method: "POST",
      headers: { Cookie: `session_id=${sessionId}` },
    });
    assert.equal(logout.status, 200);
    assert.equal(records.length, 0);

    const afterLogout = await fetch(`${baseUrl}/session`, {
      headers: { Cookie: `session_id=${sessionId}` },
    });
    assert.equal(afterLogout.status, 401);
  } finally {
    if (server) {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
    Account.findOne = originals.accountFindOne;
    Account.findById = originals.accountFindById;
    Session.create = originals.sessionCreate;
    Session.findOne = originals.sessionFindOne;
    Session.deleteOne = originals.sessionDeleteOne;
  }
});
