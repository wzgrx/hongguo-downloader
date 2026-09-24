'use strict';

const SECRET_KEY = '(?:password|passwd|proxy_password|user[_-]?name|proxy[_-]?username|token|access[_-]?token|refresh[_-]?token|authorization|proxy-authorization|cookie|set-cookie|secret|api[_-]?key)';

function redactSensitiveText(value) {
  return String(value ?? '')
    .replace(/\b(https?:\/\/)[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(new RegExp(`(["']?${SECRET_KEY}["']?\\s*[:=]\\s*["']?)([^"'\\s,;&}]+)(["']?)`, 'gi'), '$1[REDACTED]$3')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]');
}

function formatLogEntry(level, args, timestamp = new Date().toISOString()) {
  const message = (args || []).map((arg) => {
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    if (typeof arg === 'string') return arg;
    try {
      return JSON.stringify(arg);
    } catch (_) {
      return String(arg);
    }
  }).join(' ');
  return { timestamp, level: String(level || 'info'), message: redactSensitiveText(message) };
}

function createLogBuffer(limit = 1000) {
  const entries = [];
  return {
    add(entry) {
      entries.push(entry);
      if (entries.length > limit) entries.splice(0, entries.length - limit);
    },
    list() {
      return entries.slice();
    },
  };
}

module.exports = { createLogBuffer, formatLogEntry, redactSensitiveText };
