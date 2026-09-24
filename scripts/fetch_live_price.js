#!/usr/bin/env node
// 헤드리스 브라우저로 아고다/네이버예약의 실시간 객실 가격을 가져온다.
// 사용법: node fetch_live_price.js <agoda|naver> <호텔페이지URL> [체크인YYYY-MM-DD] [체크아웃YYYY-MM-DD]
// 출력: JSON { platform, propertyName, isSoldOut, rooms: [{name, price}] }
// 참고: 여기어때는 이 스크립트가 필요 없음 (WebFetch로 충분). 트립닷컴/야놀자는 봇 차단으로 이 방식이 통하지 않음(2026-09-24 확인).

const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || 'http://127.0.0.1:38805';
const CHROMIUM_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

async function fetchAgoda(url, checkIn, checkOut) {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', `--proxy-server=${PROXY}`, '--ignore-certificate-errors']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1200 }, locale: 'ko-KR' });
    page.setDefaultTimeout(40000);
    let roomGridBody = null;
    page.on('response', async (resp) => {
      if (resp.url().includes('room-grid') && resp.status() === 200 && !roomGridBody) {
        try { roomGridBody = await resp.text(); } catch (e) {}
      }
    });
    const sep = url.includes('?') ? '&' : '?';
    const qs = `${sep}checkIn=${checkIn}&los=1&rooms=1&adults=2`;
    await page.goto(url + qs, { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForTimeout(6000);
    await browser.close();
    if (!roomGridBody) return { platform: 'agoda', error: 'room-grid 응답을 받지 못함 (차단 또는 타임아웃)' };
    const data = JSON.parse(roomGridBody);
    const rooms = (data.rooms || []).map(r => {
      const offer = (r.offers || [])[0];
      return { name: r.name, price: offer ? offer.price.final.text : 'N/A', isSoldOut: !!r.isSoldOut };
    });
    return { platform: 'agoda', propertyName: data.propertyName, isSoldOut: data.isSoldOut, checkIn, rooms };
  } catch (e) {
    await browser.close().catch(()=>{});
    return { platform: 'agoda', error: e.message };
  }
}

async function fetchNaver(url) {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', `--proxy-server=${PROXY}`, '--ignore-certificate-errors']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1200 }, locale: 'ko-KR' });
    page.setDefaultTimeout(40000);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForTimeout(5000);
    const fullText = await page.evaluate(() => document.body.innerText);
    await browser.close();
    // "객실명\n가격범위\n원\n기준..." 패턴을 파싱
    const lines = fullText.split('\n');
    const rooms = [];
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^[0-9][0-9,]*\s*~?\s*[0-9,]*$/.test(lines[i + 1]?.trim() || '') && lines[i + 2]?.trim() === '원') {
        rooms.push({ name: lines[i].trim(), price: lines[i + 1].trim() + '원' });
      }
    }
    const propertyNameMatch = fullText.split('\n').map(l => l.trim()).find(l => l.length > 0 && l !== '이전 페이지');
    return { platform: 'naver', propertyName: propertyNameMatch, note: '날짜별 필터 미적용, 현재 노출 가격대 기준', rooms: rooms.slice(0, 10) };
  } catch (e) {
    await browser.close().catch(()=>{});
    return { platform: 'naver', error: e.message };
  }
}

(async () => {
  const [,, platform, url, checkIn, checkOut] = process.argv;
  if (!platform || !url) {
    console.error('사용법: node fetch_live_price.js <agoda|naver> <URL> [checkIn] [checkOut]');
    process.exit(1);
  }
  let result;
  if (platform === 'agoda') {
    result = await fetchAgoda(url, checkIn || new Date().toISOString().slice(0,10), checkOut);
  } else if (platform === 'naver') {
    result = await fetchNaver(url);
  } else {
    result = { error: 'platform은 agoda 또는 naver만 지원' };
  }
  console.log(JSON.stringify(result, null, 2));
})();
