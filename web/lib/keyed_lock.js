export class KeyedLock {
  constructor() {
    this.tails = new Map();
  }

  async withKey(key, operation) {
    const previous = this.tails.get(key) || Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    const tail = previous.then(() => current);
    this.tails.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}
