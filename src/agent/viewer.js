import settings from '../../settings.js';
import prismarineViewer from 'prismarine-viewer';

class BotViewer {
  constructor() {
    this.viewer = prismarineViewer.mineflayer;
  }

  /**
   * Initialize viewer for a bot
   * @param {Object} bot - Mineflayer bot instance
   * @param {number} countId - Unique ID for the bot's viewer port
   */
  initializeViewer(bot, countId) {
    if (!settings.show_bot_views) return;

    const viewerOptions = {
      port: 3000 + countId,
      firstPerson: true,
    };

    this.viewer(bot, viewerOptions);
  }
}

// Export singleton instance
const botViewer = new BotViewer();
export default botViewer;

// Backwards compatibility for existing code
export function addViewer(bot, count_id) {
  botViewer.initializeViewer(bot, count_id);
}
