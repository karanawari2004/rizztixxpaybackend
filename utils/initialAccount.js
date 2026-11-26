const bcrypt = require("bcryptjs");
const Account = require("../model/Account");

async function ensureInitialAccount() {
  await Account.init();
  const existingAccount = await Account.findOne({});

  if (existingAccount) {
    return existingAccount;
  }

  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD must be configured");
  }

  try {
    return await Account.create({
      username,
      passwordHash: await bcrypt.hash(password, 12),
      role: "admin",
      isInitialAccount: true,
    });
  } catch (error) {
    if (error.code === 11000) {
      const accountCreatedByAnotherInstance = await Account.findOne({
        isInitialAccount: true,
      });

      if (accountCreatedByAnotherInstance) {
        return accountCreatedByAnotherInstance;
      }

      const existingAccountCreatedDuringBootstrap = await Account.findOne({});
      if (existingAccountCreatedDuringBootstrap) {
        return existingAccountCreatedDuringBootstrap;
      }
    }

    throw error;
  }
}

module.exports = ensureInitialAccount;
