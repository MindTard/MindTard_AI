/**
 * Manages storing and retrieving location coordinates with associated names
 */
export class MemoryBank {
	/**
	 * Initialize empty memory storage
	 */
	constructor() {
	  this.memory = new Map();
	}
  
	/**
	 * Store coordinates for a named location
	 * @param {string} name - Name of the location
	 * @param {number} x - X coordinate
	 * @param {number} y - Y coordinate 
	 * @param {number} z - Z coordinate
	 */
	rememberPlace(name, x, y, z) {
	  if (!name || typeof name !== 'string') {
		throw new Error('Location name must be a non-empty string');
	  }
	  
	  this.memory.set(name, {x, y, z});
	}
  
	/**
	 * Retrieve coordinates for a named location
	 * @param {string} name - Name of the location to recall
	 * @returns {Object|null} Coordinates object {x,y,z} or null if not found
	 */
	recallPlace(name) {
	  const location = this.memory.get(name);
	  if (!location) {
		return null;
	  }
	  return location;
	}
  
	/**
	 * Get memory data as JSON object
	 * @returns {Object} JSON representation of memory
	 */
	getJson() {
	  return Object.fromEntries(this.memory);
	}
  
	/**
	 * Load memory data from JSON object
	 * @param {Object} json - JSON object to load
	 */
	loadJson(json) {
	  if (!json || typeof json !== 'object') {
		throw new Error('Invalid JSON input');
	  }
	  this.memory = new Map(Object.entries(json));
	}
  
	/**
	 * Get comma-separated list of stored location names
	 * @returns {string} Comma-separated location names
	 */
	getKeys() {
	  return Array.from(this.memory.keys()).join(', ');
	}
  
	/**
	 * Clear all stored locations
	 */
	clear() {
	  this.memory.clear();
	}
  
	/**
	 * Check if a location name exists
	 * @param {string} name - Location name to check
	 * @returns {boolean} True if location exists
	 */
	hasPlace(name) {
	  return this.memory.has(name);
	}
  
	/**
	 * Get number of stored locations
	 * @returns {number} Count of stored locations
	 */
	size() {
	  return this.memory.size;
	}
  
	/**
	 * Delete a stored location
	 * @param {string} name - Name of location to delete
	 * @returns {boolean} True if location was deleted
	 */
	forgetPlace(name) {
	  return this.memory.delete(name);
	}
  }
  