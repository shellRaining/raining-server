import http from "http";
import open from "open";
import path from "path";
import fs from "fs";
import { WebSocketServer } from "ws";
import chokidar from "chokidar";

const opts = {
  protocol: "http",
  host: "127.0.0.1",
  port: 8080,
  open: false,
  root: process.cwd()
};
const url = `${opts.protocol}://${opts.host}:${opts.port}`;
const contentTypeDict = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
};

// WebSocket server
const wss = new WebSocketServer({ noServer: true });
wss.on("connection", (ws) => {
  ws.on("error", console.error);

  // set file watcher
  const ignored = [
    function (testPath) {
      return (
        testPath !== "." && /(^[.#]|(?:__|~)$)/.test(path.basename(testPath))
      );
    },
  ];
  function handleChange(changePath) {
    const cssChange = path.extname(changePath) === ".css";
    ws.send(cssChange ? "refreshcss" : "reload");
  }
  chokidar
    .watch(opts.root, {
      ignored,
      ignoreInitial: true,
    })
    .on("change", handleChange)
    .on("add", handleChange)
    .on("unlink", handleChange)
    .on("addDir", handleChange)
    .on("unlinkDir", handleChange);
});

// http server
function inject(file) {
  const injectedScript = fs.readFileSync(path.join(import.meta.dirname, "injected.html"));
  return file.replace("</body>", injectedScript + "</body>");
}

const server = http.createServer();
server
  .on("listening", () => {
    if (opts.open) open(url);
  })
  .on("request", (req, res) => {
    const reqFilePath = req.url === "/" ? "./index.html" : `.${req.url}`;
    const extname = path.extname(reqFilePath).toLowerCase();
    const contentType = contentTypeDict[extname];
    const filePath = path.join(opts.root, reqFilePath);
    let file;

    try {
      file = fs.readFileSync(filePath, { encoding: "utf8" });
      file = inject(file);
      res.writeHead(200, { "Content-Type": contentType }).end(file, "utf-8");
    } catch (e) {
      res.writeHead(404).end();
    }
  })
  .on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });
server.listen(opts.port, opts.host);
