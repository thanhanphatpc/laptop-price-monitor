// nk_api.js — 26/10/2026
//
// Lay danh sach laptop Nguyen Kim (nguyenkim.com) qua API JSON cua pico.vn
// (backend e-commerce cua he thong Nguyen Kim).
//
// TAI SAO KHONG DUNG PUPPETEER: site dung Next.js, render phan trang bang
// AJAX toi catalog.pico.vn. Goi thang endpoint thi:
//   - 2 request la lay het ~72 SKU (KHONG can click, scroll, browser)
//   - co truong `total` de doi chieu -> biet ngay co lay thieu hay khong
//   - don gian, nhanh (~1-2s toan bo), chay tren ubuntu-latest cloud
//
// API ENDPOINT: https://catalog.pico.vn/user/api/products
//   - catId=64e5ce8e0ed5822aa85b908e (Laptop trong he thong NK)
//   - limit=50, page=1..N
//   - KHONG can auth, KHONG can session
//
// FIELD MAPPING (ket qua kham pha API):
//   name.vi       -> ten SP (SKU)
//   price         -> gia niem yet (SRP)
//   finalPrice    -> gia khuyen mai (Promotion Price)
//   code          -> Part # (ma SP)
//   stockStatus   -> "inStock" = "Con hang", con lai = "Tam het hang"
//   slugs.vi      -> path cho URL: https://www.nguyenkim.com/{slug}
//
// Ghi ra scrape-output/products-NK.json — DUNG DINH DANG voi cac scraper
// khac, de job combine (COMBINE_MODE) doc gop nhu thuong.
//
// RUI RO da biet: day la API noi bo cua pico.vn, co the doi schema bat ky luc
// nao. Neu so SP tut ve 0 ma status=200 thi kiem tra catId truoc tien.
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_HOST = 'catalog.pico.vn';
const API_PATH_BASE = '/user/api/products';
const CAT_ID = '64e5ce8e0ed5822aa85b908e'; // "Laptop" trong he thong NK
const PAGE_SIZE = 50;
const MAX_PAGES = 20; // chan vong lap vo han; ~72 SP hien tai chi can 2 trang
const OUTPUT_DIR = process.env.OUTPUT_DIR || './scrape-output';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function callApi(page, attempt = 1) {
  const apiPath = `${API_PATH_BASE}?catId=${CAT_ID}&limit=${PAGE_SIZE}&page=${page}`;
  return new Promise((resolve) => {
    const req = https.get({
      hostname: API_HOST,
      path: apiPath,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        'Origin': 'https://www.nguyenkim.com',
        'Referer': 'https://www.nguyenkim.com/laptop.c',
      },
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve({ ok: false, status: res.statusCode });
        if (d.trim().length < 20) return resolve({ ok: false, status: 'EMPTY_BODY', err: `chi ${d.length} byte` });
        try { resolve({ ok: true, json: JSON.parse(d) }); }
        catch (e) { resolve({ ok: false, status: 'PARSE', err: e.message }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 'TIMEOUT' }); });
    req.on('error', (e) => resolve({ ok: false, status: 'ERR', err: e.message }));
  }).then(async (r) => {
    if (!r.ok && attempt < 3) {
      console.log(`    ⚠ Trang ${page} lỗi (${r.status} ${r.err || ''}) — thử lại lần ${attempt + 1}/3`);
      await sleep(2000 * attempt);
      return callApi(page, attempt + 1);
    }
    return r;
  });
}

// Trich xuat brand tu ten SP — thuong la tu thu 2 hoac 3 trong ten
// Vi du: "MÁY TÍNH XÁCH TAY (NB) HP 250R G10..." -> "HP"
// Vi du: "LAPTOP ASUS VivoBook..." -> "ASUS"
const KNOWN_BRANDS = ['ASUS', 'ACER', 'LENOVO', 'DELL', 'HP', 'MSI', 'APPLE', 'LG', 'SAMSUNG',
  'MICROSOFT', 'GIGABYTE', 'RAZER', 'HUAWEI', 'XIAOMI', 'AVITA', 'CHUWI'];

function extractBrand(name) {
  const upper = (name || '').toUpperCase();
  for (const b of KNOWN_BRANDS) {
    if (upper.includes(b)) return b.charAt(0) + b.slice(1).toLowerCase();
  }
  return '';
}

function mapProduct(p) {
  const origPrice = parseInt(p.price, 10) || 0;
  const salePrice = parseInt(p.finalPrice, 10) || origPrice;

  let discount = '';
  if (origPrice > salePrice && salePrice > 0) {
    discount = `-${Math.round((1 - salePrice / origPrice) * 100)}%`;
  }

  // slug: co dang "may-tinh-xach-tay-hp-250r-g10..." -> URL day du
  const slug = (p.slugs && p.slugs.vi) || '';
  const link = slug ? `https://www.nguyenkim.com/${slug}` : '';

  const name = (p.name && p.name.vi) || (typeof p.name === 'string' ? p.name : '');

  // stockStatus: "inStock" = con hang, "outOfStock" hoac khac = het hang
  const inStock = (p.stockStatus || '') === 'inStock';
  const stockStatus = inStock ? 'Còn hàng' : 'Tạm hết hàng';

  return {
    dealer: 'Nguyen Kim',
    name,
    brand: extractBrand(name),
    cpu: '',      // NK API khong tra specs chi tiet (chi co trong ten SP)
    ram: '',
    storage: '',
    screen: '',
    gpu: '',
    weight: '',
    origPrice,
    salePrice,
    discount,
    sold: '',
    rating: '',
    link,
    stockStatus,
    partNo: p.code || '',   // ma SP NK (dung lam Part #)
  };
}

(async () => {
  const t0 = Date.now();
  const seen = new Set();
  const products = [];
  let apiTotal = null;
  let ok = false;
  let errMsg = null;

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await callApi(page);
      if (!r.ok) throw new Error(`API trang ${page} thất bại: ${r.status} ${r.err || ''}`);

      // Response co dang { data: { list: [...], total: N } } hoac { list: [...], total: N }
      const data = r.json;
      // Cau truc thuc te (xac nhan 26/10/2026): { data: { pages, total, page, limit, data: [...] } }
      const inner = data.data;
      const list = (inner && Array.isArray(inner.data) && inner.data)
        || (inner && Array.isArray(inner.list) && inner.list)
        || (Array.isArray(data.list) ? data.list : null)
        || (Array.isArray(inner) ? inner : null);
      const total = (inner && inner.total) || data.total;

      if (!Array.isArray(list)) throw new Error(`API trang ${page} trả cấu trúc lạ: ${JSON.stringify(data).slice(0, 200)}`);
      if (apiTotal === null && typeof total === 'number') apiTotal = total;
      if (list.length === 0) break;

      let added = 0;
      for (const p of list) {
        const key = p.code || p._id || p.id;
        if (!key || seen.has(key)) continue;
        const name = (p.name && p.name.vi) || (typeof p.name === 'string' ? p.name : '');
        if (!name || name.length < 5) continue;
        seen.add(key);
        products.push(mapProduct(p));
        added++;
      }
      console.log(`    → trang ${page}: ${list.length} SP (mới ${added}) | cộng dồn ${products.length}${apiTotal ? `/${apiTotal}` : ''}`);
      if (list.length < PAGE_SIZE) break;
      if (apiTotal !== null && products.length >= apiTotal) break;
      await sleep(300); // lich su voi server
    }
    ok = products.length > 0;
  } catch (e) {
    errMsg = e.message;
    console.log(`❌ Lỗi: ${errMsg}`);
  }

  // Doi chieu voi total do API khai bao
  if (apiTotal !== null) {
    const pct = Math.round((products.length / apiTotal) * 100);
    if (products.length < apiTotal * 0.90) {
      console.log(`    ⚠️ CẢNH BÁO: API báo total=${apiTotal} nhưng chỉ lấy được ${products.length} SP (${pct}%)`);
      ok = false;
      errMsg = errMsg || `lay thieu: ${products.length}/${apiTotal}`;
    } else {
      console.log(`    ✓ Khớp total: ${products.length}/${apiTotal} SP (${pct}%)`);
    }
  }

  const oos = products.filter((p) => p.stockStatus !== 'Còn hàng').length;
  console.log(`    📦 ${products.length - oos} còn hàng / ${oos} tạm hết hàng`);

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = path.join(OUTPUT_DIR, 'products-NK.json');
  fs.writeFileSync(outPath, JSON.stringify(products));
  console.log(`💾 Đã lưu ${products.length} SP ra ${outPath}`);

  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log(`\n=== TÓM TẮT (Nguyen Kim qua pico.vn API) ===`);
  console.log(`ok=${ok} products=${products.length} apiTotal=${apiTotal} elapsedSec=${elapsed} error=${errMsg || 'none'}`);
  if (!ok) process.exitCode = 1;
})();
