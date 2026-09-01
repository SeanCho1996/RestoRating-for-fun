const fs = require('node:fs/promises');
const path = require('node:path');

const emptyDatabase = () => ({ users: [], restaurants: [], ratings: [] });

class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = emptyDatabase();
    this.queue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      this.data = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.save();
    }
    for (const key of Object.keys(emptyDatabase())) {
      if (!Array.isArray(this.data[key])) this.data[key] = [];
    }
  }

  async save() {
    const temporary = `${this.filePath}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    await fs.rename(temporary, this.filePath);
  }

  async mutate(callback) {
    const operation = this.queue.then(async () => {
      const result = await callback(this.data);
      await this.save();
      return result;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}

module.exports = { Store };
