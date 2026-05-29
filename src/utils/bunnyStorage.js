const https = require('https');

const ZONE = process.env.BUNNY_STORAGE_ZONE;
const API_KEY = process.env.BUNNY_STORAGE_API_KEY;
const HOST = process.env.BUNNY_STORAGE_HOST;
const CDN_BASE = process.env.BUNNY_CDN_BASE_URL;

function bunnyRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      path: `/${ZONE}/${path}`,
      method,
      headers: { AccessKey: API_KEY },
    };

    if (body) {
      options.headers['Content-Type'] = 'application/octet-stream';
      options.headers['Content-Length'] = body.length;
    }

    const req = https.request(options, (res) => {
      res.resume(); // drain response body to free the connection
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve();
      } else {
        reject(new Error(`Bunny ${method} failed: ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Returns the public CDN URL
async function uploadToBunny(fileBuffer, filePath) {
  await bunnyRequest('PUT', filePath, fileBuffer);
  return `${CDN_BASE}/${filePath}`;
}

// filePath = everything after the CDN base URL
// e.g. "images/usr_abc_xyz.jpg" or "documents/usr_abc_xyz.pdf"
async function deleteFromBunny(publicUrl) {
  if (!publicUrl || !publicUrl.startsWith(CDN_BASE)) return;
  const filePath = publicUrl.replace(`${CDN_BASE}/`, '');
  try {
    await bunnyRequest('DELETE', filePath);
  } catch (_) {
    // don't throw on delete failures — file may already be gone
  }
}

module.exports = { uploadToBunny, deleteFromBunny };
