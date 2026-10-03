// name_enrich.js — 03/10/2026 [An Phat PC]
//
// Dien thong so cho cac dong KHONG khop tab "Part #" (Sheet cua An Phat chua
// co tab nay). Truoc day nhung dong do chi co thong so tho cua retailer,
// nen CellphoneS trong tron CPU/RAM/SSD/GPU, MBW thieu GPU/man hinh, cot
// Part # va Products Family trong o moi dealer.
//
// Ba lop, chay theo thu tu, KHONG BAO GIO ghi de o da co gia tri:
//   1. Doc thong so ngay trong TEN san pham (MBW, An Phat, Phong Vu ghi
//      cau hinh trong ngoac).
//   2. Tra cheo theo MODEL CODE (VD X1407CA-LY008W): cung model o dealer
//      khac / ngay khac da co thong so thi lay sang. Day la cach duy nhat cho
//      CellphoneS, vi ten SP cua ho khong co cau hinh.
//   3. Doan Products Family + Series Group tu ten dong may (Vivobook, TUF,
//      IdeaPad, Victus...) khi khong co tab "Segment".
//
// Khong bia: khong doc duoc thi de nguyen.
const { normalizeCpu } = require('./spec_normalize.js');
const { K } = require('./spec_dictionary.js');

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ---------- 1) Model code ----------
// Tra ve danh sach code da chuan hoa (chi chu + so), dai >= 8 ky tu de tranh
// trung nham giua cac model cung dong (VD "E1504FA" dung chung nhieu ban).
function extractCodes(name) {
  let base = String(name || '').replace(/\(.*$/s, '');
  base = base.replace(/-\s*B[aả]o h[aà]nh.*$/i, '').replace(/-\s*Nh[aậ]p kh[aẩ]u.*$/i, '');
  const out = [];
  // "Vivobook 14 X1407CA - LY008W" (kieu MBW) -> X1407CALY008W
  const m = base.match(/([A-Za-z0-9.\-]+)\s+-\s*([A-Za-z0-9.\-]+)\s*$/);
  if (m) {
    out.push(norm(m[1]) + norm(m[2]));
    if (norm(m[2]).length >= 8) out.push(norm(m[2]));
  }
  const toks = (base.match(/[A-Za-z0-9]+(?:[-./][A-Za-z0-9]+)*/g) || [])
    .map(norm).filter(t => /\d/.test(t) && /[A-Z]/.test(t));
  if (toks.length >= 2) out.push(toks[toks.length - 2] + toks[toks.length - 1]);
  if (toks.length) out.push(toks[toks.length - 1]);
  return [...new Set(out.filter(c => c.length >= 8))];
}

// Part # de hien thi: giu dang co dau gach nhu ten goc.
function displayPartNo(name) {
  if (/macbook/i.test(String(name))) return '';
  const base = String(name || '').replace(/\(.*$/s, '').trim();
  const m = base.match(/([A-Za-z0-9.\-]+)\s+-\s*([A-Za-z0-9.\-]+)\s*$/);
  if (m) return `${m[1]}-${m[2]}`;
  const toks = base.match(/[A-Za-z0-9]+(?:[-./][A-Za-z0-9]+)+|[A-Za-z]*\d[A-Za-z0-9]{5,}/g) || [];
  const t = toks.filter(x => !/\d+\s*(GB|TB)/i.test(x) && /\d/.test(x) && /[A-Za-z]/.test(x) && x.replace(/[^A-Za-z0-9]/g, '').length >= 7);
  return t.length ? t[t.length - 1] : '';
}

// ---------- 2) Thong so trong ten ----------
function parseNameSpecs(name) {
  const s = String(name || '');
  const inside = (s.match(/\(([^)]*)\)\s*$/) || [])[1] || '';
  const parts = inside.split(/\s*[|,]\s*|\/\s+/).map(x => x.trim()).filter(Boolean);
  const r = {};
  for (let p of parts) {
    p = p.replace(/\bR([3579])\s*AI\s*(\d{3})\b/i, 'Ryzen AI $1 $2');
    if (!r.cpu) {
      const n = normalizeCpu(p);
      if (n.confidence === 'full') { r.cpu = n.cpu; r.cpuSegment = n.segment; continue; }
    }
    if (!r.gpu && /RTX|GTX|Radeon|Arc|Iris|Intel\s*(UHD|Graphics)|Adreno/i.test(p)) {
      const g = K.gpu(p); if (g) { r.gpu = g; const v = p.match(/(\d+)\s*GB/i); if (v && /RTX|GTX/i.test(p)) r.vram = `${v[1]}G`; continue; }
    }
    if (!r.ssd && /(\d+)\s*(TB|GB)\b/i.test(p) && /SSD|TB|512|256|1024/i.test(p) && !/RAM|DDR/i.test(p) && r.ram) {
      const v = K.ssd(p); if (v) { r.ssd = v; continue; }
    }
    if (!r.ram && /^\s*(LPDDR\d\w*\s*|DDR\d\s*)?\d{1,3}\s*GB/i.test(p)) {
      const v = K.ram(p); if (v) { r.ram = v; continue; }
    }
    if (!r.screen) {
      const sc = p.match(/(\d{2}(?:[.,]\d)?)\s*(?:-|\s)?\s*(?:inch|")/i);
      if (sc) r.screen = `${sc[1].replace(',', '.')} inches`;
    }
  }
  // MBW: khong ghi card roi = card onboard; khong ghi kich thuoc man hinh
  // trong ngoac nhung co trong ten dong may (Vivobook 14, Victus 15, Dell 15...)
  if (!r.screen) {
    const head = s.replace(/\(.*$/s, '');
    const sc = head.match(/(\d{2}(?:\.\d)?)\s*inch/i);
    if (sc) r.screen = `${sc[1]} inches`;
    else {
      // Kich thuoc nam trong ten dong may: "Vivobook 14", "Dell 15", "S14",
      // "15IPH11", "ANV15", "AL14", "DC15250". 15 cua laptop pho thong = 15.6".
      const h = head.split(/\s+-\s+/)[0].replace(/^Laptop\s+/i, '');
      const m2 = h.match(/(?:^|[\s\-])(?:[A-Z]{1,3})?(1[3-8])(?=\s|$|[A-Z]{2,4}\d|\d{3}\b)/i);
      if (m2) r.screen = m2[1] === '15' ? '15.6 inches' : `${m2[1]} inches`;
    }
  }
  if (inside && !r.gpu && !/RTX|GTX|Radeon|Arc/i.test(inside) && r.cpu) {
    if (/^Core|Intel/i.test(r.cpu) || /^Core/.test(r.cpuSegment || '')) r.gpu = 'Intel Graphics';
    else if (/^Ryzen/.test(r.cpu)) r.gpu = 'AMD Radeon Graphics';
    else if (/^Snapdragon/.test(r.cpu)) r.gpu = 'Qualcomm Adreno';
    else if (/^Apple/.test(r.cpu)) r.gpu = 'Apple';
  }
  if (/macbook/i.test(s)) {
    const m = s.match(/\bM(\d)\s*(Pro|Max)?\b/i);
    if (m && !r.cpu) { const n = normalizeCpu(m[0]); if (n.confidence === 'full') { r.cpu = n.cpu; r.cpuSegment = n.segment; } }
    const rs = s.match(/(\d{1,3})GB\s*\/\s*(\d+(?:GB|TB))/i);
    if (rs) { r.ram = r.ram || `${rs[1]}GB`; r.ssd = r.ssd || K.ssd(rs[2]); }
    if (!r.gpu) r.gpu = 'Apple';
  }
  return r;
}

// ---------- 3) Dong may -> Products Family + Series Group ----------
// Thu tu quan trong: cum dai/cu the dat truoc ("ROG Strix" truoc "ROG").
const SERIES = [
  ['ROG Zephyrus', 'Gaming'], ['ROG Strix', 'Gaming'], ['ROG Flow', 'Gaming'], ['ROG', 'Gaming'],
  ['TUF', 'Gaming'], ['Gaming V16', 'Gaming'], ['Gaming A16', 'Gaming'], ['Vivobook Gaming', 'Gaming'],
  ['Zenbook', 'Business& Productivity'], ['ProArt', 'Content Creation'], ['ExpertBook', 'Business& Productivity'],
  ['Vivobook', 'Business& Productivity'],
  ['Legion', 'Gaming'], ['LOQ', 'Gaming'], ['IdeaPad Gaming', 'Gaming'], ['ThinkPad', 'Business& Productivity'],
  ['ThinkBook', 'Business& Productivity'], ['Yoga', 'Content Creation'], ['IdeaPad', 'Business& Productivity'],
  ['Alienware', 'Gaming'], ['XPS', 'Content Creation'], ['Latitude', 'Business& Productivity'],
  ['Vostro', 'Business& Productivity'], ['Inspiron', 'Business& Productivity'], ['Dell Pro', 'Business& Productivity'],
  ['Dell Plus', 'Business& Productivity'], ['Dell 14', 'Business& Productivity'], ['Dell 15', 'Business& Productivity'], ['Dell 16', 'Business& Productivity'],
  ['OMEN', 'Gaming'], ['Victus', 'Gaming'], ['OmniBook', 'Business& Productivity'], ['EliteBook', 'Business& Productivity'],
  ['ProBook', 'Business& Productivity'], ['Pavilion', 'Business& Productivity'], ['Envy', 'Content Creation'],
  ['HP 240', 'Business& Productivity'], ['HP 245', 'Business& Productivity'], ['HP 250', 'Business& Productivity'],
  ['HP 14', 'Business& Productivity'], ['HP 15', 'Business& Productivity'],
  ['Predator', 'Gaming'], ['Nitro', 'Gaming'], ['Swift', 'Business& Productivity'], ['TravelMate', 'Business& Productivity'],
  ['Aspire', 'Business& Productivity'],
  ['Titan', 'Gaming'], ['Raider', 'Gaming'], ['Vector', 'Gaming'], ['Stealth', 'Gaming'], ['Crosshair', 'Gaming'],
  ['Pulse', 'Gaming'], ['Sword', 'Gaming'], ['Katana', 'Gaming'], ['Cyborg', 'Gaming'], ['Bravo', 'Gaming'],
  ['Thin', 'Gaming'], ['GF63', 'Gaming'], ['Creator', 'Content Creation'], ['Prestige', 'Business& Productivity'],
  ['Modern', 'Business& Productivity'], ['Venture', 'Business& Productivity'],
  ['Aorus', 'Gaming'], ['Aero', 'Content Creation'], ['Gigabyte G5', 'Gaming'], ['Gigabyte G6', 'Gaming'], ['Gaming A16', 'Gaming'],
  ['Galaxy Book', 'Business& Productivity'], ['Gram', 'Business& Productivity'],
  ['MacBook Pro', 'Content Creation'], ['MacBook Air', 'Business& Productivity'], ['MacBook', 'Business& Productivity'],
  ['Surface', 'Business& Productivity'],
];
function guessSeries(name) {
  const s = ' ' + String(name || '').replace(/\(.*$/s, '') + ' ';
  for (const [seg, grp] of SERIES) {
    const tail = /\d$/.test(seg) ? '(?!\\d)' : '(?![A-Za-z])';
    const re = new RegExp('[^A-Za-z]' + seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+') + tail, 'i');
    if (re.test(s)) {
      // card roi RTX xx50 tro len trong dong pho thong -> van giu nhom dong may
      return { segment: seg, seriesGroup: grp };
    }
  }
  if (/\bgaming\b/i.test(s)) return { segment: '', seriesGroup: 'Gaming' };
  return null;
}

// ---------- Ap dung cho mot tap dong data.csv ----------
// rows: mang cac mang theo thu tu cot COL (truyen vao). Chi dien o trong.
const FIELDS = ['cpu', 'cpuSegment', 'ram', 'ssd', 'gpu', 'vram', 'screen'];
function fillRows(rows, COL, log = () => {}) {
  const get = (row, f) => row[COL[{ cpu: 'CPU', cpuSegment: 'CPUSegment', ram: 'RAM', ssd: 'SSD', gpu: 'GPU', vram: 'VRAM', screen: 'Screen' }[f]]];
  const set = (row, f, v) => { row[COL[{ cpu: 'CPU', cpuSegment: 'CPUSegment', ram: 'RAM', ssd: 'SSD', gpu: 'GPU', vram: 'VRAM', screen: 'Screen' }[f]]] = v; };
  let fromName = 0, fromCode = 0, series = 0, partNo = 0;

  // Lop 1: tu ten
  for (const row of rows) {
    const spec = parseNameSpecs(row[COL.SKU]);
    let changed = false;
    for (const f of FIELDS) if (!get(row, f) && spec[f]) { set(row, f, spec[f]); changed = true; }
    if (changed) fromName++;
    if (!row[COL.PartNo]) { const pn = displayPartNo(row[COL.SKU]); if (pn) { row[COL.PartNo] = pn; partNo++; } }
  }

  // Lop 2: thu vien thong so theo model code (lay tu moi dong da co CPU)
  const lib = new Map();
  for (const row of rows) {
    if (!get(row, 'cpu') && !get(row, 'ram')) continue;
    for (const c of extractCodes(row[COL.SKU])) {
      const cur = lib.get(c) || {};
      for (const f of FIELDS) if (!cur[f] && get(row, f)) cur[f] = get(row, f);
      lib.set(c, cur);
    }
  }
  const libKeys = [...lib.keys()];
  for (const row of rows) {
    const missing = FIELDS.filter(f => !get(row, f));
    if (!missing.length) continue;
    let hit = null;
    for (const c of extractCodes(row[COL.SKU])) {
      hit = lib.get(c);
      if (!hit) { const k = libKeys.find(k => k.length >= 10 && (k.includes(c) || c.includes(k))); if (k) hit = lib.get(k); }
      if (hit) break;
    }
    if (!hit) continue;
    let changed = false;
    for (const f of missing) if (hit[f]) { set(row, f, hit[f]); changed = true; }
    if (changed) fromCode++;
  }

  // Lop 3: dong may
  for (const row of rows) {
    if (row[COL.Segment] && row[COL.SeriesGroup]) continue;
    const g = guessSeries(row[COL.SKU]);
    if (!g) continue;
    if (!row[COL.Segment] && g.segment) row[COL.Segment] = g.segment;
    if (!row[COL.SeriesGroup] && g.seriesGroup) row[COL.SeriesGroup] = g.seriesGroup;
    series++;
  }
  log(`name_enrich: +thong so tu ten ${fromName} dong, +tra cheo model code ${fromCode} dong, +Part# ${partNo} dong, +dong may ${series} dong`);
  return { fromName, fromCode, partNo, series };
}

module.exports = { extractCodes, displayPartNo, parseNameSpecs, guessSeries, fillRows };
