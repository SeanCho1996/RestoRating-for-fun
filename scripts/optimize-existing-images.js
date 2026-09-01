const fs = require('node:fs/promises');
const path = require('node:path');
const { optimizeImageFile } = require('../lib/image-processor');

const root = path.resolve(__dirname, '..');
const databasePath = process.env.DATA_FILE || path.join(root, 'data', 'database.json');
const uploadsDirectory = path.join(root, 'uploads');
const backupDirectory = path.join(root, 'data', 'original-image-backups');

async function main() {
  const database = JSON.parse(await fs.readFile(databasePath, 'utf8'));
  const migrated = [];

  for (const restaurant of database.restaurants || []) {
    if (restaurant.thumbnailUrl || !restaurant.photoUrl?.startsWith('/uploads/')) continue;
    const originalPath = path.join(uploadsDirectory, path.basename(restaurant.photoUrl));
    const result = await optimizeImageFile(originalPath, uploadsDirectory);
    migrated.push({ restaurant, originalPath, oldFilename: path.basename(originalPath), ...result });
    restaurant.photoUrl = result.photoUrl;
    restaurant.thumbnailUrl = result.thumbnailUrl;
    console.log(`已优化：${restaurant.name}`);
  }

  if (!migrated.length) {
    console.log('没有需要迁移的图片。');
    return;
  }

  const temporaryDatabase = `${databasePath}.image-migration.tmp`;
  await fs.writeFile(temporaryDatabase, JSON.stringify(database, null, 2), { mode: 0o600 });
  await fs.rename(temporaryDatabase, databasePath);
  await fs.mkdir(backupDirectory, { recursive: true });

  for (const item of migrated) {
    const backupPath = path.join(backupDirectory, item.oldFilename);
    await fs.rename(item.originalPath, backupPath).catch((error) => {
      console.warn(`原图备份失败 ${item.oldFilename}: ${error.message}`);
    });
  }

  console.log(`迁移完成：${migrated.length} 张图片；原图保存在 ${backupDirectory}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
