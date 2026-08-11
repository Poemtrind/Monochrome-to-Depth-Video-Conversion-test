#!/usr/bin/env node
/**
 * THIRD3 本地启动服务器（零依赖，只用 Node.js 内置模块）
 *
 * 作用：
 *  - 把本文件夹作为静态站点托管在 http://localhost:8080
 *  - 设置 COOP/COEP 响应头，使浏览器进入「跨源隔离」状态，
 *    从而启用 WASM 多线程（SharedArrayBuffer），深度推理更快
 *  - 模型从本地硬盘读取，省去从 GitHub 远程下载约 100MB 的时间
 *
 * 用法：
 *  1. 安装 Node.js（https://nodejs.org，LTS 版即可）
 *  2. 双击 start.bat（Windows），或在终端运行 `node server.js`
 *  3. 浏览器自动打开 http://localhost:8080
 *  4. 点「加载深度模型」即可（首次从本地硬盘载入，很快）
 *
 * 停止：在终端按 Ctrl + C
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = __dirname;
const PORT = 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.bin':  'application/octet-stream',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.map':  'application/json',
};

const server = http.createServer((req, res) => {
  // 关键：启用跨源隔离，允许 WASM 多线程（SharedArrayBuffer）
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.normalize(path.join(ROOT, urlPath));
  // 防目录穿越
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log('========================================');
  console.log(' 深度视频转换（本地版）已启动');
  console.log(' 地址：' + url);
  console.log(' 按 Ctrl + C 停止');
  console.log('========================================');
  // 尝试自动打开浏览器
  const cmd = process.platform === 'win32'
    ? 'start ""'
    : (process.platform === 'darwin' ? 'open' : 'xdg-open');
  exec(`${cmd} ${url}`, (e) => {
    if (e) console.log('（未能自动打开浏览器，请手动访问 ' + url + '）');
  });
});
