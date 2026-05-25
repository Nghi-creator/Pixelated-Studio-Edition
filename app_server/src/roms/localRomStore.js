const fs = require("fs");
const path = require("path");

function sanitizeUserId(userId) {
  return userId && /^[a-zA-Z0-9_-]+$/.test(userId) ? userId : "anonymous";
}

function getUserFolder(userId) {
  const folderPath = path.join("/roms", sanitizeUserId(userId));
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  return folderPath;
}

module.exports = {
  getUserFolder,
  sanitizeUserId,
};
