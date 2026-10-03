#!/usr/bin/env bash
# scrape-retry.sh <DEALER_TAG> <MIN_ITEMS> [MAX_ATTEMPTS]
# 03/10/2026 [An Phat PC]: chay "npm start" cho 1 dealer; neu so SP lay duoc
# duoi nguong (VD MBW sang 03/10 chi lay duoc 50/440 ma) thi chay lai, toi da
# MAX_ATTEMPTS lan, va GIU LAN LAY DUOC NHIEU NHAT. Khong bao gio lam job fail
# vi ly do coverage — viec chan du lieu thieu nam o enrich-and-export.js.
set -u
TAG="$1"; MIN="$2"; MAX="${3:-3}"
OUT="scrape-output/products-${TAG}.json"
BEST=-1
count() { node -e "try{console.log(JSON.parse(require('fs').readFileSync('$OUT','utf8')).length)}catch(e){console.log(0)}"; }
for i in $(seq 1 "$MAX"); do
  echo "=== ${TAG}: lan chay $i/$MAX ==="
  npm start || echo "npm start tra loi loi (lan $i) - van kiem tra file"
  N=$(count)
  echo "${TAG}: lan $i lay duoc $N SP (nguong $MIN)"
  if [ "$N" -gt "$BEST" ]; then
    BEST=$N
    mkdir -p /tmp/best && cp -f "$OUT" "/tmp/best/products-${TAG}.json" 2>/dev/null || true
    cp -f scrape-output/coverage-*.txt /tmp/best/ 2>/dev/null || true
  fi
  if [ "$N" -ge "$MIN" ]; then break; fi
  if [ "$i" -lt "$MAX" ]; then echo "Duoi nguong - nghi 90s roi chay lai"; sleep 90; fi
done
if [ -f "/tmp/best/products-${TAG}.json" ]; then
  cp -f "/tmp/best/products-${TAG}.json" "$OUT"
  rm -f scrape-output/coverage-*.txt; cp -f /tmp/best/coverage-*.txt scrape-output/ 2>/dev/null || true
  [ "$BEST" -lt "$MIN" ] && echo "[${TAG}] chi lay duoc ${BEST} SP sau ${MAX} lan (nguong ${MIN})" > "scrape-output/coverage-${TAG}-retry.txt"
fi
echo "${TAG}: dung ket qua tot nhat = $BEST SP"
exit 0
