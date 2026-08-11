#!/usr/bin/env node
/**
 * THIRD3 本地启动服务器（零依赖，只用 Node.js 内置模块）
 *
 * 作用：
 *  - 把本文件夹作为静态站点托管在 http://localhost:8777
 *  - 设置 COOP/COEP 响应头，使浏览器进入「跨源隔离」状态，
 *    从而启用 WASM 多线程（SharedArrayBuffer），深度推理更快
 *  - 模型从本地硬盘读取，省去从 GitHub 远程下载约 100MB 的时间
 *
 * 注意：浏览器由 start.bat 负责打开，本文件不负责（避免 node 内嵌 start 引号失效）。
 * 停止：直接关闭 start.bat 弹出的那个小黑窗口即可。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT, 10) || 8777;

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
  '.mp4':  'video/mp4',
};

function serveFile(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + filePath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      // 跨源隔离：开启 SharedArrayBuffer，让 ONNX Runtime Web 多线程 WASM 可用
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  // 防止目录穿越
  const safePath = path.normalize(urlPath).replace(/^(\.\.\/?)+/, '');
  const filePath = path.join(ROOT, safePath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  serveFile(req, res, filePath);
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log('========================================');
  console.log(' 深度视频转换（本地版）已启动');
  console.log(' 地址：' + url);
  console.log(' 请在浏览器打开上面的地址（不要自己输其他端口）');
  console.log(' 不用时：直接关闭本窗口即可停止服务器');
  console.log('========================================');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('错误：端口 ' + PORT + ' 已被本机其他程序占用。');
    console.log('请先关闭占用该端口的程序，或把 server.js 里的 PORT 改成其他数字后重试。');
  } else {
    console.log('服务器启动出错：' + err.message);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('收到中断信号，服务器退出。');
  process.exit(0);
});
