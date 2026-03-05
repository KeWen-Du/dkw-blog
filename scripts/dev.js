#!/usr/bin/env node

const { spawn } = require('child_process');
const net = require('net');

const DEFAULT_PORT = 3000;
const MAX_PORT = 3010;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', () => {
      resolve(false);
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    
    server.listen(port);
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port <= MAX_PORT; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return null;
}

async function main() {
  const port = await findAvailablePort(DEFAULT_PORT);
  
  if (!port) {
    console.error(`No available port found between ${DEFAULT_PORT} and ${MAX_PORT}`);
    process.exit(1);
  }
  
  if (port !== DEFAULT_PORT) {
    console.log(`Port ${DEFAULT_PORT} is in use, using port ${port} instead`);
  }
  
  const child = spawn('next', ['dev', '--port', String(port)], {
    stdio: 'inherit',
    shell: true,
    windowsHide: true
  });
  
  child.on('error', (error) => {
    console.error('Failed to start dev server:', error);
    process.exit(1);
  });
  
  child.on('exit', (code) => {
    process.exit(code || 0);
  });
  
  process.on('SIGINT', () => {
    child.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
  });
}

main();