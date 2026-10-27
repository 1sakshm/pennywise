// Render launch/video/scene.html to MP4: needs puppeteer-core (npm i puppeteer-core@23.11.1) and imageio-ffmpeg (pip).
// node render.js D:/AlanAI/launch/video/scene.html D:/AlanAI/launch/video/pennywise_launch.mp4 video
const puppeteer = require("puppeteer-core");
const { spawn } = require("child_process");
const [,, scene, out, mode = "video", times = ""] = process.argv;
const FFMPEG = "D:/AlanAI/.venv/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win64-v4.2.2.exe";
(async () => {
  const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--force-device-scale-factor=1"] });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  p.on("pageerror", (e) => console.log("PAGEERR", String(e).slice(0, 300)));
  await p.goto("file:///" + scene.split(String.fromCharCode(92)).join("/"), { waitUntil: "networkidle0", timeout: 120000 });
  await p.evaluate(() => window.ready);
  const total = await p.evaluate(() => window.TOTAL);
  if (mode === "stills") {
    for (const t of times.split(",").map(Number)) {
      await p.evaluate((t) => window.renderAt(t), t);
      await p.screenshot({ path: `${out}_${String(t).replace(".", "_")}.png` });
    }
  } else {
    const fps = 30, n = Math.round(total * fps);
    const ff = spawn(FFMPEG, ["-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "17",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "ignore", "pipe"] });
    let err = ""; ff.stderr.on("data", (d) => (err = (err + d).slice(-2000)));
    for (let i = 0; i < n; i++) {
      await p.evaluate((t) => window.renderAt(t), i / fps);
      const buf = await p.screenshot({ type: "jpeg", quality: 95 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
      if (i % 150 === 0) console.log(`frame ${i}/${n}`);
    }
    ff.stdin.end();
    await new Promise((r) => ff.on("close", r));
    console.log("ffmpeg tail:", err.split("\n").slice(-3).join(" | "));
  }
  await b.close();
})();
