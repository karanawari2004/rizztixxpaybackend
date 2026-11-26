const Account = require("../model/Account");
const Session = require("../model/Session");
const { clearAuthCookie, hashSessionId } = require("../utils/authCookie");

async function authenticateSession(req, res, next) {
  const sessionId = req.cookies?.session_id;

  if (!sessionId) {
    if (req.cookies?.access_token) {
      clearAuthCookie(res);
    }

    return res.status(401).json({
      success: false,
      message: "Please log in",
    });
  }

  if (!/^[a-f0-9]{64}$/.test(sessionId)) {
    clearAuthCookie(res);
    return res.status(401).json({
      success: false,
      message: "Invalid session. Please log in again",
    });
  }

  try {
    const sessionTokenId = hashSessionId(sessionId);
    const session = await Session.findOne({
      tokenId: sessionTokenId,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      clearAuthCookie(res);
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again",
      });
    }

    const account = await Account.findById(session.accountId);

    if (!account) {
      await Session.deleteOne({ tokenId: sessionTokenId });
      clearAuthCookie(res);
      return res.status(401).json({
        success: false,
        message: "Please log in",
      });
    }

    req.user = {
      id: account._id.toString(),
      username: account.username,
      role: account.role,
    };
    req.sessionTokenId = sessionTokenId;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = authenticateSession;
