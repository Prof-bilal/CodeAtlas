// Old utilities - DEPRECATED
// @ts-nocheck

module.exports = {
  formatDate: function(d) { return d.toISOString(); },
  parseDate: function(s) { return new Date(s); },
  generateId: function() { return Math.random().toString(36).substring(2); },
};
