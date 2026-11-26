
const express = require("express");
const authenticateSession = require("../middleware/authenticateSession");

const router = express.Router();
router.use(authenticateSession);

const {

  createAdminData,

  getAdminData,

  getAdminDataById,

  updateAdminData,

  deleteAdminData,

} = require("../controllers/AdminController");


router.post("/", createAdminData);



router.get("/", getAdminData);



router.get("/:id", getAdminDataById);



router.put("/:id", updateAdminData);



router.delete("/:id", deleteAdminData);

module.exports = router; 