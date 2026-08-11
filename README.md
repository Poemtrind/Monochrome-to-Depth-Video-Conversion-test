# Monochrome-to-Depth-Video-Conversion-test

把黑白/普通视频转换成伪深度（单色深浅）视频的纯前端网页应用。模型与推理全部在浏览器本地运行，无需服务器、无需 API Key。

## 在线使用（打开即用，适合分享）

访问 GitHub Pages 链接即可（由本仓库自动托管）：

```
https://poemtrind.github.io/Monochrome-to-Depth-Video-Conversion-test/
```

首次打开需从 GitHub 下载深度模型（约 100MB），加载完成后浏览器会缓存，之后刷新更快。

## 在本地运行（推荐，加载更快）

从 GitHub 下载本项目（仓库页面点 Code → Download ZIP，解压后）即可在本地运行。
本地运行的优势：模型从你的硬盘读取，无需从 GitHub 远程下载约 100MB，
且会自动启用 WASM 多线程，深度推理更快。

前置：安装 [Node.js](https://nodejs.org)（LTS 版即可，无需手动安装其他依赖）。

启动方式（任选其一）：
1. 双击 `start.bat`（Windows 自动起服务并打开浏览器，默认端口 8080；若 8080 被占用会自动换到 8081、8082……请以弹窗里显示的地址为准）；
2. 或在项目目录的终端里运行 `node server.js`，再浏览器打开弹窗里显示的地址（如 http://localhost:8080 ，被占用时可能是 http://localhost:8081 等）。

> 若没有 Node.js，也可以改用 Python：`python -m http.server 8080`，
> 然后浏览器打开 http://localhost:8080
> （此方式没有跨源隔离头，WASM 为单线程，速度略慢，但仍可用）。

停止：在终端按 `Ctrl + C`。

## 使用步骤

1. 打开网页后，点「加载深度模型」（首次约需几秒到十几秒）。
2. 选择要转换的视频文件，可设置输出分辨率、开始/结束时间、深浅方向、是否叠加轮廓。
3. 点「生成视频」，处理完成后下载生成的深度视频。
