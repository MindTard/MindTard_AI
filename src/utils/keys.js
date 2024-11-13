import { readFileSync } from 'fs';

class KeyManager {
  constructor() {
    this.keys = {};
    this.loadKeys();
  }

  loadKeys() {
    try {
      const data = readFileSync('./keys.json', 'utf8');
      this.keys = JSON.parse(data);
    } catch (err) {
      console.warn('keys.json not found. Defaulting to environment variables.'); // still works with local models
    }
  }

  getKey(name) {
    const key = this.keys[name] || process.env[name];
    
    if (!key) {
      throw new Error(`API key "${name}" not found in keys.json or environment variables!`);
    }
    
    return key;
  }

  hasKey(name) {
    return Boolean(this.keys[name] || process.env[name]);
  }
}

const keyManager = new KeyManager();

export const getKey = (name) => keyManager.getKey(name);
export const hasKey = (name) => keyManager.hasKey(name);
