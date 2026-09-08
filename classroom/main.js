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
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    // 旧配置可能没有 autoStart 字段，确保默认为 true
    if (typeof saved.autoStart !== 'boolean') saved.autoStart = true;
    return saved;
  }
  catch {
    return { serverUrl:'', deviceToken:'', deviceId:null, classId:null,
             className:'', deviceName:'教室电脑', displayMode:'fullscreen', autoStart:true };
  }
}
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}
let config = loadConfig();

// ─── 托盘图标（铃铛 PNG，在线橙色 / 离线灰色，32×32 嵌入）────────────────────
const iconOnline  = nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACi0lEQVR4nOyXO2hTURjHf+cmTVrTGtJIxWLtAwcVUaQIgkuH6uAiFurgYC0IFRR0ERxcdNJJB5cO0lpfIDg5VFA7SF2quAmCtLYIBat9py8Tc/yS1CbtzePeYzBLf9zknvOdc77vf8+553G9lBgvhuiehiMo63wqQ7fqHHmPAcYCJPhTlGpYlXNU/vZigIUBuq++MR08IUbt0ffrajHASAC+2Fa7Jx3GAOWmsu5t6JSuv0OcoF26lkvNovQl1fH1kVOfjgTox8EQ0fArSTZLdxeqLZceIjTfqk7+nOdfBejuUBB/6LsE9lMuvbzrOCyMw/g7KYzlaRhfYWVmu+qans3nv/AsKA8Nik4/VhmcegNllSn75z4Yupm7nbJEcOgtTB/M5z7vSyhz/Yp42p/M1DSngyfY2UJh1AHd03QBUwHS7dfX0jNfSI7vurwTDdzARIBuxyOt01NreRIGr8LcKIy9hA+3cEgNefXlEtBT34blfU5RiJ1QHWP92UpyD4HytFE0PO25SnLPAkU9xUKxG9cC/hObAjYFmAnwVckesU2W5kAqH12ApR9yj+AW9wIq62DLhsXN4xdB1bA4AZFvuMHdiShQaw+eSaIssAM32JZi/bDxGHHroqRapDi4VuAph/A+Ch8hZMOa/AS/VzJMWk5KDMjmdk+dHR7IKUA/w8dS05SYAza/FTLmVQ4Xx8SGldi87ERYHq5WXUT/GtYNgTrNL7llbZnsAad4K7LbNROZwZNVbZWUOiw1z8jvkDRIP3IsEmaRKpwQi8xBfCrDMoq2PuJbemILR4kxWgf0g6a7ov3yButt1TFyDZeYfZhoXthsKt6PAcZDIL3QKkLOrXrplad/jQElfwf+AAAA//9MrMnIAAAABklEQVQDAEBHoYQFamKHAAAAAElFTkSuQmCC','base64'));
const iconOffline = nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAC20lEQVR4nOyXS0xTQRSGz5nb0hYsj1LaIAQx0YWGaIyamOjCBWw0Ea2BRINvoCaa6E4Xbly60oUbrPHBQxMSHuqCBYaFceMjJGiIMSSoBAwQHil9wFU642lNK6W97e2kphu+pr1z59w555/HnTk1QI4xgCSezp4DwFlzuCwYb2ttOvkBJJAWgJw9B4TqyA3Hg/S7AyRAkMDT/nIrYmg8zpGBVVw6Vf8TMoSBBOY8LFxft7qiloIEGY2Ap6P/AgK/KwQUIcY3FfQBLrygsKstTSc69frUJaCrq6tkWeQPCg57MW2LsBB8P1/Mam/U1/vSPZ3WXVvbYBGz+GcosImAys1lEAyqMD07B4KGQlMGFypfsTrd7jpvKv9p3wLF4nsLiCbGEI7WHQKj8W+TsfEJGB75otkOGZqU/MAbKu5O5T/lIvS0912n4DXhst1WEgseptxph/SIXQ86X1wGWQE0P7eiZa8vEGfzLgVADyhCt0FGQEODUOgSe7VUVYV3Hz+Dzx+AyakZGBn9CjpxpDJqLsLH7b2uEGIPZAGOypHWpmMDyWyaI7CKzAVZQhGrDVo2TQFM8C2QJQTiNi2b9GGULTYEbAiQElBo3QR2ewlYC/Ij937anGbnFiOb1H8XUFVZDk5HfO5hsxVHvjN0Qk5MTkMmZJQRVZQ7EoKvxemwR57JhISt2NPRW0c5xRWyHEbAomi9xWyCmp3bQQ+fRsciZ8c/hJcyhyHye7/lrGtIU0B3d3fe0opxgWoL1jstozmvrqoAPXz7MQVz84sJ9ZS2+XmwyuZ27/sdrYubgsbGxl+kdD6ZU4vFDHqxmJM/S72dXRs8TMIiNIHYrwo8TQf5HmoSOw/8gWApdcEKOgguLy9RRxZigRG+U4o2zA3GZ0lE5RapfeBhR989ulyLrxV3ms+4bkKGSP0xoXF7leBIwABIID0Fj57214YYPx8uK5w9uXju+GuQIOdr4A8AAAD//0ydYxwAAAAGSURBVAMAdgHZmFfamzkAAAAASUVORK5CYII=','base64'));
const iconApp     = nativeImage.createFromBuffer(Buffer.from('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','base64'));

// ─── 全局引用 ────────────────────────────────────────────────────────────────
let tray=null, setupWin=null, overlayWin=null, toastWin=null;
let ws=null, wsConnected=false, reconnectIdx=0, reconnectTimer=null;

// ─── WebSocket ──────────────────────────────────────────────────────────────
function wsUrl() {
  if (!config.serverUrl || !config.deviceToken) return null;
  return config.serverUrl.replace(/^http/,'ws') + '/ws/device?token=' + encodeURIComponent(config.deviceToken);
}

function connectWs() {
  // 先摘掉旧连接的所有事件，再关闭，防止 close 事件触发 scheduleReconnect 与新连接竞争
  if (ws) { ws.removeAllListeners(); ws.on('error',()=>{}); try { ws.close(); } catch {} ws=null; }
  clearTimeout(reconnectTimer);
  reconnectIdx=0;
  const url = wsUrl();
  if (!url) return;
  const socket = new WebSocket(url);
  ws = socket;
  socket.on('open', () => {
    if (ws!==socket) return; // 已被更新的连接替代，忽略
    wsConnected=true; reconnectIdx=0;
    tray?.setImage(iconOnline);
    tray?.setToolTip('班级通知屏 · ' + (config.className||'') + ' · 已连接');
    broadcastStatus();
  });
  socket.on('message', (raw) => {
    if (ws!==socket) return; // 过期连接，忽略
    let msg; try { msg=JSON.parse(raw.toString()); } catch { return; }
    if (msg.type==='ping') socket.send(JSON.stringify({type:'pong',ts:Date.now()}));
    else if (msg.type==='ready') {
      config.deviceId=msg.deviceId; config.classId=msg.classId; config.className=msg.className;
      saveConfig(config); broadcastStatus();
    } else if (msg.type==='notice') {
      showNotice(msg);
      socket.send(JSON.stringify({type:'ack',id:msg.id}));
    }
  });
  socket.on('close', () => {
    if (ws!==socket) return; // 过期连接，忽略
    wsConnected=false; tray?.setImage(iconOffline);
    tray?.setToolTip('班级通知屏 · 已断开，重连中…'); broadcastStatus(); scheduleReconnect();
  });
  socket.on('error', () => {
    if (ws!==socket) return;
    wsConnected=false; broadcastStatus();
  });
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
  setupWin = new BrowserWindow({ width:480, height:600, resizable:false, title:'班级通知屏 · 设置', icon:iconApp,
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
  if (typeof updates.autoStart==='boolean') app.setLoginItemSettings({openAtLogin:updates.autoStart,path:app.getPath('exe'),name:'班级通知屏'});
  if (needReconnect) connectWs();
  return {ok:true};
});
ipcMain.handle('device:bind', async (_, {serverUrl, bindCode}) => {
  const deviceName = require('os').hostname();
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
  // 启动时同步开机自启动（指定 exe 路径，避免 Windows 下标灰）
  app.setLoginItemSettings({ openAtLogin: config.autoStart !== false, path: app.getPath('exe'), name: '班级通知屏' });
  createSetupWin();            // 每次启动都打开设置窗口
  if (config.deviceToken) connectWs();
  createOverlayWin();
  createToastWin();
});

app.on('window-all-closed', e=>e.preventDefault());
app.on('before-quit', ()=>{ ws?.close(); });
