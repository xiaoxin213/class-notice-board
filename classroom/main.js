'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path  = require('path');
const fs    = require('fs');
const zlib  = require('zlib');
const https = require('https');
const http  = require('http');
const { WebSocket } = require('ws');

// ─── 常量 ──────────────────────────────────────────────────────────────────
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

// ─── 配置 ──────────────────────────────────────────────────────────────────
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch {
    return { serverUrl:'', deviceToken:'', deviceId:null, classId:null,
             className:'', deviceName:'教室电脑', displayMode:'fullscreen', autoStart:false };
  }
}
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}
let config = loadConfig();

// ─── 纯 JS 生成 16x16 实色 PNG ─────────────────────────────────────────────
function makePng16(r, g, b) {
  const tbl = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    tbl[i] = c;
  }
  function crc32(buf) { let c=-1; for (const b of buf) c=tbl[(c^b)&0xff]^(c>>>8); return (c^-1)>>>0; }
  function chunk(type, data) {
    const tb=Buffer.from(type,'ascii'), len=Buffer.alloc(4), crc=Buffer.alloc(4);
    len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([tb,data])));
    return Buffer.concat([len,tb,data,crc]);
  }
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(16,0); ihdr.writeUInt32BE(16,4); ihdr[8]=8; ihdr[9]=2;
  const row=Buffer.alloc(1+16*3);
  for (let x=0;x<16;x++){row[1+x*3]=r;row[2+x*3]=g;row[3+x*3]=b;}
  const raw=Buffer.concat(Array.from({length:16},()=>row));
  return Buffer.concat([
    Buffer.from('\x89PNG\r\n\x1a\n','binary'),
    chunk('IHDR',ihdr), chunk('IDAT',zlib.deflateSync(raw)), chunk('IEND',Buffer.alloc(0)),
  ]);
}
const iconOnline  = nativeImage.createFromBuffer(makePng16(34,197,94));
const iconOffline = nativeImage.createFromBuffer(makePng16(156,163,175));

// ─── 全局引用 ────────────────────────────────────────────────────────────────
let tray=null, setupWin=null, overlayWin=null, toastWin=null;
let ws=null, wsConnected=false, reconnectIdx=0, reconnectTimer=null;

// ─── WebSocket ──────────────────────────────────────────────────────────────
function wsUrl() {
  if (!config.serverUrl || !config.deviceToken) return null;
  return config.serverUrl.replace(/^http/,'ws') + '/ws/device?token=' + encodeURIComponent(config.deviceToken);
}

function connectWs() {
  if (ws) { try { ws.close(); } catch {} ws=null; }
  clearTimeout(reconnectTimer);
  const url = wsUrl();
  if (!url) return;
  ws = new WebSocket(url);
  ws.on('open', () => {
    wsConnected=true; reconnectIdx=0;
    tray?.setImage(iconOnline);
    tray?.setToolTip('班级通知屏 · ' + (config.className||'') + ' · 已连接');
    broadcastStatus();
  });
  ws.on('message', (raw) => {
    let msg; try { msg=JSON.parse(raw.toString()); } catch { return; }
    if (msg.type==='ping') ws.send(JSON.stringify({type:'pong',ts:Date.now()}));
    else if (msg.type==='ready') {
      config.deviceId=msg.deviceId; config.classId=msg.classId; config.className=msg.className;
      saveConfig(config); broadcastStatus();
    } else if (msg.type==='notice') {
      showNotice(msg);
      ws.send(JSON.stringify({type:'ack',id:msg.id}));
    }
  });
  ws.on('close', () => {
    wsConnected=false; tray?.setImage(iconOffline);
    tray?.setToolTip('班级通知屏 · 已断开，重连中…'); broadcastStatus(); scheduleReconnect();
  });
  ws.on('error', () => { wsConnected=false; broadcastStatus(); });
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  const delay = RECONNECT_DELAYS[Math.min(reconnectIdx, RECONNECT_DELAYS.length-1)];
  reconnectIdx++;
  reconnectTimer = setTimeout(connectWs, delay);
}

function broadcastStatus() {
  const s={connected:wsConnected,deviceId:config.deviceId,classId:config.classId,className:config.className};
  setupWin?.webContents.send('ws:status', s);
}

// ─── 通知展示 ────────────────────────────────────────────────────────────────
function showNotice(notice) {
  if (config.displayMode==='fullscreen') {
    if (!overlayWin||overlayWin.isDestroyed()) createOverlayWin();
    overlayWin.webContents.send('notify:show', notice);
    overlayWin.show(); overlayWin.setAlwaysOnTop(true,'screen-saver'); overlayWin.focus();
  } else {
    if (!toastWin||toastWin.isDestroyed()) createToastWin();
    toastWin.webContents.send('notify:show', notice);
    toastWin.show(); toastWin.setAlwaysOnTop(true,'screen-saver');
  }
}

// ─── 窗口 ────────────────────────────────────────────────────────────────────
function createSetupWin() {
  if (setupWin&&!setupWin.isDestroyed()) { setupWin.focus(); return; }
  setupWin = new BrowserWindow({ width:480, height:560, resizable:false, title:'班级通知屏 · 设置',
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true } });
  setupWin.loadFile(path.join(__dirname,'renderer','setup.html'));
  setupWin.setMenu(null);
  setupWin.on('closed', ()=>{ setupWin=null; });
}

function createOverlayWin() {
  const {width,height} = screen.getPrimaryDisplay().bounds;
  overlayWin = new BrowserWindow({ width, height, x:0, y:0, frame:false, transparent:true,
    alwaysOnTop:true, skipTaskbar:true, focusable:false,
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true } });
  overlayWin.loadFile(path.join(__dirname,'renderer','overlay.html'));
  overlayWin.hide();
  overlayWin.on('closed', ()=>{ overlayWin=null; });
}

function createToastWin() {
  const {x:wx,y:wy,width:ww,height:wh} = screen.getPrimaryDisplay().workArea;
  toastWin = new BrowserWindow({ width:400, height:140, x:wx+ww-420, y:wy+wh-160,
    frame:false, transparent:true, alwaysOnTop:true, skipTaskbar:true, focusable:false,
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true } });
  toastWin.loadFile(path.join(__dirname,'renderer','toast.html'));
  toastWin.hide();
  toastWin.on('closed', ()=>{ toastWin=null; });
}

// ─── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.handle('config:get', () => ({...config}));
ipcMain.handle('config:save', (_, updates) => {
  const needReconnect = updates.serverUrl!==config.serverUrl || updates.deviceToken!==config.deviceToken;
  Object.assign(config, updates); saveConfig(config);
  if (typeof updates.autoStart==='boolean') app.setLoginItemSettings({openAtLogin:updates.autoStart,name:'班级通知屏'});
  if (needReconnect) connectWs();
  return {ok:true};
});
ipcMain.handle('device:bind', async (_, {serverUrl, bindCode, deviceName}) => {
  const data = await apiPost(serverUrl, '/api/device/bind', {code:bindCode, deviceName});
  Object.assign(config, {serverUrl, deviceToken:data.deviceToken, deviceId:data.deviceId,
    classId:data.classId, className:data.className, deviceName});
  saveConfig(config); connectWs();
  return {className:data.className};
});
ipcMain.handle('ws:status', () => ({connected:wsConnected,deviceId:config.deviceId,classId:config.classId,className:config.className}));
ipcMain.on('notify:done', (_, id) => { overlayWin?.hide(); toastWin?.hide(); });

// ─── HTTP 辅助 ────────────────────────────────────────────────────────────────
function apiPost(baseUrl, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload=JSON.stringify(body), parsed=new URL(urlPath, baseUrl);
    const mod = parsed.protocol==='https:' ? https : http;
    const req = mod.request(parsed, {method:'POST',
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}},
      (res) => {
        let data='';
        res.on('data', d=>data+=d);
        res.on('end', ()=>{
          try {
            const json=data?JSON.parse(data):{};
            if (res.statusCode>=400) reject(new Error(json.error??`请求失败(${res.statusCode})`));
            else resolve(json);
          } catch { reject(new Error('服务器返回格式异常')); }
        });
      });
    req.on('error', ()=>reject(new Error('无法连接服务器，请检查地址'))); req.write(payload); req.end();
  });
}

// ─── 启动 ────────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  app.setAppUserModelId('xyz.wongpitt.cnb.classroom');
  tray = new Tray(iconOffline);
  tray.setToolTip('班级通知屏 · 未连接');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label:'设置 / 绑定', click:createSetupWin },
    { type:'separator' },
    { label:'退出', click:()=>app.quit() },
  ]));
  tray.on('double-click', createSetupWin);
  if (!config.deviceToken) createSetupWin();
  else connectWs();
  createOverlayWin();
  createToastWin();
});

app.on('window-all-closed', e=>e.preventDefault());
app.on('before-quit', ()=>{ ws?.close(); });
