const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { uploadToBunny, deleteFromBunny } = require('./bunnyStorage');

const LOCAL_UPLOADS_DIR = path.join(__dirname, '../../uploads');

const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER;

function generateFileName(userId, originalName) {
  const ext = path.extname(originalName).toLowerCase() || '.bin';
  const rand = crypto.randomBytes(8).toString('hex');
  return `usr_${userId}_${rand}${ext}`;
}

async function uploadFile(buffer, userId, originalName, folder) {
  const fileName = generateFileName(userId, originalName);

  if (STORAGE_PROVIDER === 'bunny') {
    const filePath = folder ? `${folder}/${fileName}` : fileName;
    return uploadToBunny(buffer, filePath);
  }

  // local fallback
  const dest = path.join(LOCAL_UPLOADS_DIR, fileName);
  fs.writeFileSync(dest, buffer);
  return `/uploads/${fileName}`;
}

async function deleteFile(url) {
  if (!url) return;

  if (STORAGE_PROVIDER === 'bunny') {
    await deleteFromBunny(url);
    return;
  }

  // local fallback
  if (!url.startsWith('/uploads/')) return;
  const filePath = path.join(LOCAL_UPLOADS_DIR, path.basename(url));
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }
}

module.exports = { uploadFile, deleteFile };
