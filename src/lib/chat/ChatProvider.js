/**
 * ChatProvider interface — every provider must implement this shape.
 *
 * @typedef {Object} ChatResult
 * @property {string}   reply
 * @property {Array}    citations       [{title, url, snippet}]
 * @property {boolean}  local_fallback  true when cloud was NOT used
 * @property {string}   intent          A | B | C | greeting | IMAGE
 * @property {string}   provider        which implementation answered
 */

export class ChatProvider {
  /** @returns {string} */
  getName() { throw new Error('implement getName()'); }

  /** @returns {Promise<boolean>} */
  async isAvailable() { throw new Error('implement isAvailable()'); }

  /**
   * @param {string}         message
   * @param {Array}          history   [{role:'user'|'assistant', content:string}]
   * @param {Object}         context   { dnaProfile?, image? }
   * @returns {Promise<ChatResult>}
   */
  async sendMessage(_message, _history, _context) {
    throw new Error('implement sendMessage()');
  }
}
