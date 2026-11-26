const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: "admin",
      immutable: true,
    },
    isInitialAccount: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

accountSchema.index(
  { isInitialAccount: 1 },
  {
    unique: true,
    partialFilterExpression: { isInitialAccount: true },
  }
);

module.exports = mongoose.model("Account", accountSchema);
