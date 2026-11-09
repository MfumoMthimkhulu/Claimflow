// Isolated browser tests: all camera frames and coordinates are synthetic.
// Uses an installed Chromium browser and Node's built-in CDP/WebSocket support.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { preview } from 'vite';

const executable = process.env.BROWSER_PATH || [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
].find(existsSync);
assert(executable, 'Set BROWSER_PATH to an installed Edge, Chrome, or Chromium executable.');
const profile = mkdtempSync(join(tmpdir(), 'claimflow-evidence-test-'));
const server = await preview({ preview: { host: '127.0.0.1', port: 0, open: false } });
const address = server.httpServer.address();
const url = `http://127.0.0.1:${address.port}`;
let browser;
let socket;
let serial = 0;
const pending = new Map();
const pageErrors = [];

function command(method, params = {}) {
  const id = ++serial;
  return new Promise((resolveCommand, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 30_000);
    pending.set(id, { resolve: value => { clearTimeout(timeout); resolveCommand(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}

async function waitFor(expression, description = expression) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  const body = await evaluate('document.body.innerText');
  throw new Error(`Timed out: ${description}\n${body}`);
}

async function click(text) {
  const selector = `Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)} && !button.disabled)`;
  await waitFor(`Boolean(${selector})`, `enabled button: ${text}`);
  await evaluate(`(${selector}).click()`);
}

async function openClaim(reference) {
  await waitFor(`Array.from(document.querySelectorAll('tbody tr')).some(row => row.innerText.includes(${JSON.stringify(reference)}))`);
  await evaluate(`Array.from(document.querySelectorAll('tbody tr')).find(row => row.innerText.includes(${JSON.stringify(reference)})).querySelector('button').click()`);
  await waitFor(`Boolean(document.querySelector('.vehicle-evidence')) && !document.querySelector('.vehicle-evidence').innerText.includes('Loading evidence')`);
}

async function cameraReady() {
  await waitFor(`Array.from(document.querySelectorAll('.vehicle-evidence button')).some(button => /Take vehicle photo|Take paired selfie/.test(button.textContent) && !button.disabled)`, 'camera ready');
}

async function screenshot(name) {
  if (!process.env.EVIDENCE_SCREENSHOTS) return;
  const folder = resolve(process.env.EVIDENCE_SCREENSHOTS);
  mkdirSync(folder, { recursive: true });
  await evaluate(`document.querySelector('.vehicle-evidence').scrollIntoView()`);
  const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(folder, `${name}.png`), Buffer.from(data, 'base64'));
}

const mocks = `(() => {
  window.__cameraDenied = false;
  window.__locationDenied = false;
  window.__saveFailure = false;
  window.__clockOffset = 0;
  window.__streams = [];
  const now = performance.now.bind(performance);
  Object.defineProperty(performance, 'now', { value: () => now() + window.__clockOffset });
  const camera = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async () => {
    if (window.__cameraDenied) throw new DOMException('Test camera denial', 'NotAllowedError');
    const stream = await camera({ audio: false, video: true });
    window.__streams.push(stream);
    return stream;
  };
  navigator.geolocation.getCurrentPosition = (success, failure) => {
    queueMicrotask(() => window.__locationDenied ? failure({ code: 1 }) : success({
      coords: { latitude: -26.2041, longitude: 28.0473, accuracy: 25 }, timestamp: Date.now()
    }));
  };
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (window.__saveFailure) throw new DOMException('Test quota failure', 'QuotaExceededError');
    return put.apply(this, args);
  };
})()`;

try {
  browser = spawn(executable, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', 'about:blank',
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  const endpoint = await new Promise((resolveEndpoint, reject) => {
    const timer = setTimeout(() => reject(new Error(`Browser did not start. ${stderr}`)), 30_000);
    browser.once('error', error => { clearTimeout(timer); reject(error); });
    browser.once('exit', code => { clearTimeout(timer); reject(new Error(`Browser exited (${code}). ${stderr}`)); });
    browser.stderr.on('data', chunk => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolveEndpoint(match[1]); }
    });
  });
  const port = new URL(endpoint).port;
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
  const page = pages.find(target => target.type === 'page');
  assert(page, 'Browser must expose a page target.');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveSocket, reject) => { socket.addEventListener('open', resolveSocket, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') pageErrors.push(message.params.exceptionDetails.text);
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (message.error) waiting.reject(new Error(message.error.message));
    else waiting.resolve(message.result);
  });
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Page.addScriptToEvaluateOnNewDocument', { source: mocks });
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command('Page.navigate', { url });
  await click('Try demo \u2192');
  await waitFor(`Boolean(document.querySelector('.auth-demo-users button'))`);
  await evaluate(`document.querySelector('.auth-demo-users button').click()`);
  await openClaim('CLM-1042');
  assert.equal(await evaluate(`Boolean(document.querySelector('.cfa-root'))`), false, 'Floating chat must not overlap capture controls');
  await screenshot('mobile-intro');
  assert.equal(await evaluate(`Boolean(document.querySelector('input[type="file"]'))`), false);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Start live capture')).disabled`), true);
  await evaluate(`document.querySelector('.evidence-consent input').click(); window.__locationDenied = true`);
  await click('Start live capture \u2192');
  await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('Location permission was denied')`);
  await evaluate(`window.__locationDenied = false; window.__cameraDenied = true`);
  await click('Start live capture \u2192');
  await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('Camera permission was denied')`);
  await evaluate(`window.__cameraDenied = false`);
  await click('Retry camera');
  await cameraReady();
  await screenshot('mobile-camera');
  console.log('PASS consent, no gallery input, permission errors and camera retry');

  // Expire a pair without waiting a minute, then resume and retake it.
  await click('Take vehicle photo');
  await cameraReady();
  await evaluate(`window.__clockOffset += 61000`);
  await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('60-second selfie window expired')`);
  await click('Resume & retake pair');
  await cameraReady();
  // Take and retake a complete pair before accepting it.
  await click('Take vehicle photo'); await cameraReady();
  await click('Take paired selfie');
  await click('Retake this pair'); await cameraReady();
  for (let i = 0; i < 4; i++) {
    await click('Take vehicle photo'); await cameraReady();
    await click('Take paired selfie');
    await click(i === 3 ? 'Review all evidence \u2192' : 'Keep pair & continue \u2192');
    if (i < 3) await cameraReady();
  }
  await waitFor(`document.querySelectorAll('.evidence-gallery img').length === 8`);
  assert.equal(await evaluate(`window.__streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))`), true);
  await evaluate(`window.__saveFailure = true`);
  await click('Save evidence on this device');
  await waitFor(`Boolean(document.querySelector('[role="alert"]'))`);
  assert.equal(await evaluate(`document.querySelectorAll('.evidence-gallery img').length`), 8);
  await evaluate(`window.__saveFailure = false`);
  await click('Save evidence on this device');
  await waitFor(`document.body.innerText.includes('Evidence saved on this device')`);
  await screenshot('mobile-saved');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await screenshot('desktop-saved');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate(`document.body.innerText.includes('Saved locally \u00b7 verification pending')`), true);
  console.log('PASS pair expiry, retake, four pairs, track cleanup and storage failure recovery');

  await command('Page.reload');
  await openClaim('CLM-1042');
  await waitFor(`document.body.innerText.includes('Evidence saved on this device')`);
  assert.equal(await evaluate(`document.querySelectorAll('.evidence-gallery img').length`), 8);
  await evaluate(`document.querySelector('.profile-button').click()`);
  await waitFor(`Boolean(document.querySelector('.profile-menu'))`);
  await evaluate(`Array.from(document.querySelectorAll('.profile-menu button')).find(b => b.innerText.includes('Claims Manager')).click()`);
  await openClaim('CLM-1042');
  assert.equal(await evaluate(`document.body.innerText.includes('Evidence saved on this device')`), true);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.vehicle-evidence button')).some(b => b.textContent.includes('Delete'))`), false);
  await evaluate(`document.querySelector('.profile-button').click()`);
  await waitFor(`Boolean(document.querySelector('.profile-menu'))`);
  await evaluate(`Array.from(document.querySelectorAll('.profile-menu button')).find(b => b.innerText.includes('Sipho Dlamini')).click()`);
  await openClaim('CLM-1039');
  assert.equal(await evaluate(`Boolean(document.querySelector('.evidence-gallery'))`), false);
  assert.equal(await evaluate(`Boolean(document.querySelector('.evidence-consent'))`), true);
  console.log('PASS reload persistence, manager read-only view and customer separation');

  await evaluate(`document.querySelector('.profile-button').click()`);
  await waitFor(`Boolean(document.querySelector('.profile-menu'))`);
  await evaluate(`Array.from(document.querySelectorAll('.profile-menu button')).find(b => b.innerText.includes('Thando Mokoena')).click()`);
  await openClaim('CLM-1042');
  await click('Delete local evidence');
  await click('Delete evidence');
  await waitFor(`Boolean(document.querySelector('.evidence-consent'))`);
  assert.equal(await evaluate(`document.body.innerText.includes('Saved locally \u00b7 verification pending')`), false);

  await evaluate(`document.querySelector('.evidence-consent input').click()`);
  await click('Start live capture \u2192'); await cameraReady();
  await evaluate(`Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))`);
  await waitFor(`document.body.innerText.includes('Capture paused because you left the page')`);
  assert.equal(await evaluate(`window.__streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))`), true);
  await evaluate(`Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })`);
  await click('Resume & retake pair'); await cameraReady();
  await evaluate(`window.__clockOffset += 601000`);
  await waitFor(`document.body.innerText.includes('10-minute capture session expired')`);
  await click('Start again');
  await evaluate(`document.querySelector('.evidence-consent input').click()`);
  await click('Start live capture \u2192'); await cameraReady();
  await click('My Claims');
  await waitFor(`!document.querySelector('.vehicle-evidence')`);
  assert.equal(await evaluate(`window.__streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))`), true);
  console.log('PASS local deletion, hidden-page interruption, session expiry and navigation cleanup');

  // New vehicle claims expose the same capture flow; other claim types retain their workflow.
  await click('Submit a Claim');
  await click('Next step \u2192');
  await evaluate(`(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const inputs = document.querySelectorAll('.wizard-body input');
    setter.call(inputs[0], 'Synthetic vehicle test'); inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(inputs[1], '15000'); inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await click('Next step \u2192');
  await waitFor(`document.body.innerText.includes('Capture with your camera after submitting')`);
  await click('Next step \u2192');
  await click('Submit & capture \u2192');
  await waitFor(`Boolean(document.querySelector('.evidence-consent'))`);
  assert.equal(await evaluate(`document.querySelector('.detail-heading').innerText.includes('Synthetic vehicle test')`), true);
  await click('My Claims');
  await waitFor(`Boolean(document.querySelector('tbody tr'))`);
  await evaluate(`Array.from(document.querySelectorAll('tbody tr')).find(row => row.innerText.includes('CLM-1040')).querySelector('button').click()`);
  await waitFor(`Boolean(document.querySelector('.detail-heading'))`);
  assert.equal(await evaluate(`Boolean(document.querySelector('.vehicle-evidence'))`), false);
  assert.equal(await evaluate(`Boolean(document.querySelector('.cfa-root'))`), true, 'Chat remains available for other claims');
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(button => button.textContent.includes('Mark received'))`), true);
  console.log('PASS new vehicle submission and existing home document flow');
  assert.deepEqual(pageErrors, [], 'Browser must have no uncaught exceptions');
  console.log('All live evidence browser tests passed (synthetic camera and location).');
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) {
    browser.kill();
    await Promise.race([new Promise(done => browser.once('exit', done)), delay(5000)]);
  }
  await new Promise(done => server.httpServer.close(done));
  // Only delete the exact test profile generated above, within the OS temp directory.
  const tempRoot = resolve(tmpdir()) + sep;
  const absoluteProfile = resolve(profile);
  assert(absoluteProfile.startsWith(tempRoot) && absoluteProfile.slice(tempRoot.length).startsWith('claimflow-evidence-test-'));
  try { rmSync(absoluteProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
  catch { console.warn(`Test profile could not be removed: ${absoluteProfile}`); }
}
