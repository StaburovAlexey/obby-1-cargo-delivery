



export const CLOUD_SAVE_KEY = 'urbanRouteSave';

export function resolveYandexLanguage(language) {
  const base = String(language || '').toLowerCase().split(/[-_]/)[0];
  return ['ru', 'be', 'kk', 'uk', 'uz'].includes(base) ? 'ru' : 'en';
}

function bounded(operation, milliseconds, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
    Promise.resolve().then(operation).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

async function loadSdk(globals, document, timeoutMs) {
  if (globals.YaGames?.init) return globals.YaGames;
  if (!document?.createElement || !document.head?.appendChild) throw new Error('Yandex SDK unavailable');
  await bounded(() => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/sdk.js'; script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Yandex SDK failed to load'));
    document.head.appendChild(script);
  }), timeoutMs, 'Yandex SDK load');
  if (!globals.YaGames?.init) throw new Error('Yandex SDK did not expose YaGames.init');
  return globals.YaGames;
}

function developmentSdk(language) {

  let data = {};
  const copy = value => JSON.parse(JSON.stringify(value));
  return {
    environment: { i18n: { lang: language || 'en' } }, on() {}, off() {},
    features: { LoadingAPI: { ready() {} }, GameplayAPI: { start() {}, stop() {} } },
    async getPlayer() { return { async getData() { return copy(data); }, async setData(value) { data = copy(value); } }; },
    async getPayments() { return { async getCatalog() { return []; }, async getPurchases() { return []; }, async purchase() { throw new Error('Purchases unavailable in development'); } }; },
    adv: { showFullscreenAdv({ callbacks }) { callbacks.onClose(false); } },
  };
}



export async function initializeYandexPlatform(options = {}) {
  const globals = options.global || globalThis;
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || 15000);
  const development = options.development === true;
  let sdk = options.sdk;
  if (!sdk && development) sdk = developmentSdk(options.language);
  if (!sdk) {
    const factory = await loadSdk(globals, options.document === undefined ? globals.document : options.document, timeoutMs);
    sdk = await bounded(() => factory.init(), timeoutMs, 'Yandex SDK initialization');
  }
  if (!sdk || typeof sdk.on !== 'function') throw new Error('Invalid Yandex SDK');
  let playerPromise, paymentsPromise, generation = 0, destroyed = false, readySent = false, playing = false;
  const status = { paused: false, accountSelection: false, reloadRequired: false, development };
  const subscriptions = [];
  const ensureAccount = () => {
    if (destroyed) throw new Error('Yandex platform destroyed');
    if (status.accountSelection || status.reloadRequired) throw new Error('Yandex account changed; reload required');
  };
  const subscribe = (name, callback) => {
    const unsubscribe = sdk.on(name, callback);
    subscriptions.push(typeof unsubscribe === 'function' ? unsubscribe : () => sdk.off?.(name, callback));
  };
  const feature = (name, method) => {
    const target = sdk.features?.[name];
    if (typeof target?.[method] !== 'function') throw new Error(`Yandex SDK ${name}.${method} unavailable`);
    return target[method]();
  };
  const stop = () => {
    if (!playing) return false;
    feature('GameplayAPI', 'stop'); playing = false; return true;
  };

  subscribe('game_api_pause', () => { status.paused = true; stop(); options.onPause?.(); });
  subscribe('game_api_resume', () => { if (!status.reloadRequired && !status.accountSelection) { status.paused = false; options.onResume?.(); } });
  subscribe(sdk.EVENTS?.ACCOUNT_SELECTION_DIALOG_OPENED || 'ACCOUNT_SELECTION_DIALOG_OPENED', () => {
    generation++; status.accountSelection = true; status.reloadRequired = true; status.paused = true;
    playerPromise = undefined; paymentsPromise = undefined; stop(); options.onPause?.();
  });
  subscribe(sdk.EVENTS?.ACCOUNT_SELECTION_DIALOG_CLOSED || 'ACCOUNT_SELECTION_DIALOG_CLOSED', () => {
    status.accountSelection = false;

    if (options.onAccountChange) options.onAccountChange();
    else globals.location?.reload?.();
  });
  const getPlayer = () => {
    ensureAccount();
    if (!playerPromise) playerPromise = bounded(() => sdk.getPlayer(), timeoutMs, 'Yandex player').catch(error => { playerPromise = undefined; throw error; });
    return playerPromise;
  };
  const getPayments = () => {
    ensureAccount();
    if (!paymentsPromise) paymentsPromise = bounded(() => sdk.getPayments ? sdk.getPayments() : sdk.payments, timeoutMs, 'Yandex payments').then(value => {
      if (!value) throw new Error('Yandex payments unavailable'); return value;
    }).catch(error => { paymentsPromise = undefined; throw error; });
    return paymentsPromise;
  };
  const accountCall = async (target, method, args, interactive = false) => {
    ensureAccount(); const startedGeneration = generation;
    const object = await target(); ensureAccount();
    if (startedGeneration !== generation) throw new Error('Yandex account changed');
    if (typeof object[method] !== 'function') throw new Error(`Yandex ${method} unavailable`);


    const result = interactive ? await object[method](...args) : await bounded(() => object[method](...args), timeoutMs, `Yandex ${method}`);
    ensureAccount();
    if (startedGeneration !== generation) throw new Error('Yandex account changed');
    return result;
  };
  return {
    id:'yandex', name:'Яндекс Игры', sdk, development, language: resolveYandexLanguage(sdk.environment?.i18n?.lang), status,
    ready() { if (readySent) return false; feature('LoadingAPI', 'ready'); readySent = true; return true; },
    gameplayStart() { if (playing || status.paused || status.reloadRequired || destroyed) return false; feature('GameplayAPI', 'start'); playing = true; return true; },
    gameplayStop: stop,
    async loadSave() { const data = await accountCall(getPlayer, 'getData', [[CLOUD_SAVE_KEY]]); return data?.[CLOUD_SAVE_KEY] ?? null; },
    saveSave(envelope) { return accountCall(getPlayer, 'setData', [{ [CLOUD_SAVE_KEY]: envelope }, true]); },
    getCatalog() { return accountCall(getPayments, 'getCatalog', []); },
    getPurchases() { return accountCall(getPayments, 'getPurchases', []); },
    purchase(productId) { return accountCall(getPayments, 'purchase', [{ id: productId }], true); },
    showAd(callbacks = {}) {
      return bounded(() => new Promise((resolve, reject) => {
        ensureAccount();
        let settled = false;
        const finish = (error, wasShown) => {
          if (settled) return; settled = true;
          if (error) { callbacks.onError?.(error); reject(error instanceof Error ? error : new Error('Yandex advertisement failed')); }
          else { callbacks.onClose?.(wasShown === true); resolve({ wasShown: wasShown === true }); }
        };
        if (!sdk.adv?.showFullscreenAdv) throw new Error('Yandex advertisements unavailable');
        sdk.adv.showFullscreenAdv({ callbacks: { onOpen: () => { if (!settled) callbacks.onOpen?.(); }, onClose: shown => finish(null, shown), onError: error => finish(error) } });
      }), Math.max(timeoutMs, Number(options.adTimeoutMs) || 120000), 'Yandex advertisement');
    },
    destroy() { if (destroyed) return; stop(); destroyed = true; generation++; for (const unsubscribe of subscriptions) unsubscribe(); },
  };
}
