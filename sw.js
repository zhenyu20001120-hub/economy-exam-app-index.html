/* 工商管理刷题 App —— Service Worker（PWA 离线缓存）
 * 缓存策略：
 *   - 静态资源(HTML/CSS/JS/图标) cache-first；
 *   - 题库等数据 JSON **network-first**（更新立刻生效，离线时回退缓存）；
 *   - 导航请求回退 index.html（SPA）。
 * 版本号 CACHE 每次结构性更新时 +1，激活时自动清掉老缓存。 */
const CACHE = 'gq-exam-v2';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.webmanifest',
  './bank.json',
  './chapters.json',
  './lecture.json',
  './changes.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
];
// 数据文件走网络优先，保证题库/解析更新立刻到达
const DATA_FILES = /(\/(bank|lecture|chapters|changes)\.json)$/;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 导航请求（页面）：网络优先，失败回退缓存 index.html
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // 数据 JSON：网络优先，失败回退缓存（保证更新立刻生效，同时保留离线能力）
  if (DATA_FILES.test(url.pathname)) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req)),
    );
    return;
  }

  // 其它同源静态资源：cache-first，回退网络并写缓存
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    }),
  );
});
