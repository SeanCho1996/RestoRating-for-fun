const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const run = promisify(execFile);

async function convertImage(inputPath, outputPath, operations) {
  await run('convert', [
    '-limit', 'memory', '128MiB',
    '-limit', 'map', '256MiB',
    `${inputPath}[0]`,
    '-auto-orient',
    '-strip',
    ...operations,
    '-define', 'webp:method=6',
    outputPath,
  ], { timeout: 30_000, maxBuffer: 1024 * 1024 });
}

async function optimizeImageFile(inputPath, uploadsDirectory, id = crypto.randomUUID()) {
  await fs.mkdir(uploadsDirectory, { recursive: true });
  const optimizedFilename = `${id}.webp`;
  const thumbnailFilename = `${id}-thumb.webp`;
  const optimizedPath = path.join(uploadsDirectory, optimizedFilename);
  const thumbnailPath = path.join(uploadsDirectory, thumbnailFilename);

  try {
    await convertImage(inputPath, optimizedPath, ['-resize', '1600x1600>', '-quality', '82']);
    await convertImage(optimizedPath, thumbnailPath, ['-resize', '480x320^', '-gravity', 'center', '-extent', '480x320', '-quality', '76']);
  } catch (error) {
    await Promise.all([
      fs.unlink(optimizedPath).catch(() => {}),
      fs.unlink(thumbnailPath).catch(() => {}),
    ]);
    throw error;
  }

  return {
    photoUrl: `/uploads/${optimizedFilename}`,
    thumbnailUrl: `/uploads/${thumbnailFilename}`,
    optimizedPath,
    thumbnailPath,
  };
}

async function optimizeUploadedImage(data, extension, uploadsDirectory) {
  const id = crypto.randomUUID();
  const temporaryPath = path.join(uploadsDirectory, `.upload-${id}${extension}`);
  await fs.mkdir(uploadsDirectory, { recursive: true });
  await fs.writeFile(temporaryPath, data, { flag: 'wx', mode: 0o600 });
  try {
    return await optimizeImageFile(temporaryPath, uploadsDirectory, id);
  } finally {
    await fs.unlink(temporaryPath).catch(() => {});
  }
}

module.exports = { optimizeImageFile, optimizeUploadedImage };
