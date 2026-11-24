// frontend/shared/escape.js - HTML/Attribute escaping and URL sanitization
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exp = factory();
    root.esc = exp.esc;
    root.escAttr = exp.escAttr;
    root.safeUrl = exp.safeUrl;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /**
   * Escape HTML entities to prevent stored and reflected XSS in innerHTML
   */
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Escape attributes to prevent breaking out of attribute quotes
   */
  function escAttr(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Sanitize URLs to prevent XSS via javascript: or data: URIs
   */
  function safeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    // Strip control characters
    const sanitized = trimmed.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
    // Rejects javascript:, data:, vbscript: URIs
    if (/^(?:javascript|data|vbscript):/i.test(sanitized)) {
      return '';
    }
    return escAttr(sanitized);
  }

  return { esc, escAttr, safeUrl };
});
