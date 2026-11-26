const express = require("express");
const bcrypt = require("bcryptjs");
const Account = require("../model/Account");
const authenticateSession = require("../middleware/authenticateSession");
const { setAuthCookie } = require("../utils/authCookie");

const router = express.Router();

router.use(authenticateSession);

function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

function isValidCredentials(username, password, limitPasswordLength = true) {
  return (
    typeof username === "string" &&
    username.trim().length > 0 &&
    username.trim().length <= 64 &&
    typeof password === "string" &&
    password.length > 0 &&
    (!limitPasswordLength || Buffer.byteLength(password, "utf8") <= 72)
  );
}

router.post("/", async (req, res) => {
  const { username, password } = req.body || {};

  if (!isValidCredentials(username, password)) {
    return res.status(400).json({
      success: false,
      message: "Enter a username and password (up to 72 bytes)",
    });
  }

  try {
    const account = await Account.create({
      username: normalizeUsername(username),
      passwordHash: await bcrypt.hash(password, 12),
      role: "admin",
    });

    return res.status(201).json({
      success: true,
      user: { username: account.username, role: account.role },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "That username is already in use",
      });
    }

    console.error("Create account error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to create the account",
    });
  }
});

router.put("/credentials", async (req, res) => {
  const {
    currentUsername,
    currentPassword,
    newUsername,
    newPassword,
  } = req.body || {};

  if (
    !isValidCredentials(currentUsername, currentPassword, false) ||
    !isValidCredentials(newUsername, newPassword)
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter valid current and new usernames and passwords",
    });
  }

  try {
    const account = req.user.id
      ? await Account.findById(req.user.id)
      : await Account.findOne({
          username: normalizeUsername(req.user.username),
        });

    if (
      !account ||
      account.username !== normalizeUsername(currentUsername) ||
      !(await bcrypt.compare(currentPassword, account.passwordHash))
    ) {
      return res.status(401).json({
        success: false,
        message: "Current username or password is incorrect",
      });
    }

    account.username = normalizeUsername(newUsername);
    account.passwordHash = await bcrypt.hash(newPassword, 12);
    await account.save();

    await setAuthCookie(res, account);

    return res.json({
      success: true,
      message: "Credentials updated successfully",
      user: { username: account.username, role: account.role },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "That username is already in use",
      });
    }

    console.error("Update credentials error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update credentials",
    });
  }
});

module.exports = router;
