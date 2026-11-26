const crypto = require("crypto");
const Session = require("../model/Session");

const isProd = process.env.NODE_ENV === "production";
const sessionDurationMs = 8 * 60 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/",
  maxAge: sessionDurationMs,
};

function hashSessionId(sessionId) {
  return crypto.createHash("sha256").update(sessionId).digest("hex");
}

async function setAuthCookie(res, account) {
  const sessionId = crypto.randomBytes(32).toString("hex");

  await Session.create({
    tokenId: hashSessionId(sessionId),
    accountId: account._id,
    expiresAt: new Date(Date.now() + sessionDurationMs),
  });

  clearAuthCookie(res);
  res.cookie("session_id", sessionId, cookieOptions);
}

function clearAuthCookie(res) {
  const options = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  };

  res.clearCookie("session_id", options);
  res.clearCookie("access_token", options);
}

module.exports = { setAuthCookie, clearAuthCookie, hashSessionId };
