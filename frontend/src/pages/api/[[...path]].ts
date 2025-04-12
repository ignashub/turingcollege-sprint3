import type { NextApiRequest, NextApiResponse } from 'next';
import httpProxy from 'http-proxy';
import { parse } from 'url';
import { IncomingMessage, ServerResponse } from 'http';

// Create a proxy server with custom agent options
const proxy = httpProxy.createProxyServer({
  target: 'http://localhost:5000',
  changeOrigin: true,
  // Increase timeouts for large file uploads
  proxyTimeout: 120000, // 2 minutes
  timeout: 120000, // 2 minutes
});

// Add error handling to the proxy
proxy.on('error', (err: Error, req: IncomingMessage, res: ServerResponse) => {
  console.error('Proxy error:', err);
  if ('writeHead' in res && !res.headersSent) {
    res.writeHead(500, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
  }
});

// This disables the body parser for this route
export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Don't forward cookies to the API server
  req.headers.cookie = '';

  const url = parse(req.url!, true);
  const path = url.pathname?.replace('/api', '') || '/';
  
  console.log(`Proxying request: ${req.method} ${path}`);

  return new Promise((resolve, reject) => {
    proxy.web(req, res, { target: 'http://localhost:5000' + path }, (err: Error | undefined) => {
      if (err) {
        console.error('Proxy error:', err);
        reject(err);
      } else {
        resolve(true);
      }
    });
  });
} 