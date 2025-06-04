'use strict';

const http = require('http');
const https = require('https');
const { parse, format } = require('url');
const pipe = require('promisepipe');
const marked = require('marked-promise');
const access = require('access-control');
const { readFile } = require('fs-promise');

const cors = access();

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'public',
  'proxy-authenticate',
  'transfer-encoding',
  'upgrade'
]);

// Main request handler
module.exports = async (req, res) => {
  if (cors(req, res)) return;

  if (req.url === '/' || req.url === '/favicon.ico') {
    try {
      const markdownString = await readFile('./readme.md', { encoding: 'utf8' });
      const content = await marked(markdownString);
      res.setHeader('Content-Type', 'text/html; charset=utf8');
      res.end(content);
      return;
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Failed to load homepage.');
      return;
    }
  }

  const parsed = parse(req.url.slice(1)); // remove leading "/"
  const target = format(parsed);

  const proxy = target.startsWith('https') ? https : http;

  const proxyReq = proxy.request({
    method: req.method,
    headers: Object.fromEntries(Object.entries(req.headers).filter(
      ([key]) => !hopByHopHeaders.has(key.toLowerCase())
    )),
    hostname: parsed.hostname,
    port: parsed.port,
    path: parsed.path,
  }, proxyRes => {
    Object.entries(proxyRes.headers).forEach(([key, value]) => {
      if (!hopByHopHeaders.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    res.statusCode = proxyRes.statusCode;
    res.statusMessage = proxyRes.statusMessage;
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    console.error('Proxy error:', err);
    res.statusCode = 502;
    res.end('Bad Gateway');
  });

  req.pipe(proxyReq);
};
