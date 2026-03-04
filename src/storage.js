/**
 * Cloudflare R2 Storage for file uploads
 */

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'blissnexus-files';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-0f9b65e78da5406c9d1fb1ba2332e33c.r2.dev';

let s3Client = null;

function init() {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
    console.log('[Storage] R2 not configured - file uploads disabled');
    return false;
  }
  
  s3Client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_KEY,
    },
  });
  
  console.log('[Storage] R2 configured, public URL:', R2_PUBLIC_URL);
  return true;
}

async function uploadFile(buffer, filename, contentType) {
  if (!s3Client) throw new Error('Storage not configured');
  
  // Generate unique key
  const ext = filename.split('.').pop() || 'bin';
  const key = `uploads/${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${ext}`;
  
  await s3Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  
  // Return public URL
  const url = `${R2_PUBLIC_URL}/${key}`;
  return { key, url, filename, contentType, size: buffer.length };
}

async function getSignedDownloadUrl(key, expiresIn = 3600) {
  if (!s3Client) throw new Error('Storage not configured');
  
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });
  
  return await getSignedUrl(s3Client, command, { expiresIn });
}

function isConfigured() {
  return s3Client !== null;
}

module.exports = { init, uploadFile, getSignedDownloadUrl, isConfigured };
