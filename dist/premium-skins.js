export const PREMIUM_SKIN_IDS = Object.freeze(['dancing-npc-girl', 'jandel', 'kreekcraft', 'spyder-sammy', 'spider-man', 'jeff-the-killer']);
export const premiumProductId = characterId => `skin_${characterId}`;



export function createPremiumSkins({ platform, onChange, onBusy, ids = PREMIUM_SKIN_IDS, productId = premiumProductId } = {}) {
  const productCharacters = new Map(ids.map(id => [productId(id), id]));
  if (!platform) throw new Error('Premium platform required');
  const ownedIds = new Set(), catalog = new Map();
  const status = { available: false, failed: false, reason: null, busy: false, entitlementsConfirmed:false };
  const listeners=new Set();
  let refreshing, buying;
  const changed = () => {const value={ownedIds,catalog,status};onChange?.(value);for(const listener of listeners)listener(value);};
  const restore = purchases => {
    if (!Array.isArray(purchases)) throw new Error('Invalid Yandex purchases response');
    if(platform.id==='vk')ownedIds.clear();
    for (const purchase of purchases) {
      const characterId = productCharacters.get(purchase?.productID);
      if (characterId) ownedIds.add(characterId);
    }
    status.entitlementsConfirmed=true;
  };
  const initialize = () => {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const [products, purchases] = await Promise.allSettled([platform.getCatalog(), platform.getPurchases()]);
      let error;
      if (products.status === 'fulfilled' && Array.isArray(products.value)) {
        catalog.clear();
        for (const product of products.value) {
          const characterId = productCharacters.get(product?.id);
          if (characterId) catalog.set(characterId, product);
        }
      } else error = products.status === 'rejected' ? products.reason : new Error('Invalid Yandex catalog response');
      if (purchases.status === 'fulfilled') { try { restore(purchases.value); } catch (cause) { error = cause; } }
      else error = purchases.reason;
      Object.assign(status, { available: !error, failed: !!error, reason: error?.message || (error ? String(error) : null) });
      changed(); return !error;
    })().finally(() => { refreshing = undefined; });
    return refreshing;
  };
  return {
    ownedIds, catalog, status, initialize,
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    async purchase(characterId) {
      if (ownedIds.has(characterId)) return true;
      if (!ids.includes(characterId) || !catalog.has(characterId) || buying) return false;
      buying = true; status.busy = true; onBusy?.(true); changed();
      try {
        let purchaseError;
        try {
          const purchase = await platform.purchase(productId(characterId));
          if (purchase?.productID === productId(characterId)) ownedIds.add(characterId);
          else purchaseError = new Error('Unconfirmed Yandex purchase');
        } catch (error) { purchaseError = error; }


        try { restore(await platform.getPurchases()); }
        catch (error) { purchaseError ||= error; }
        const owned = ownedIds.has(characterId);
        Object.assign(status, { failed: !owned, reason: owned ? null : purchaseError?.message || 'Purchase not confirmed' });
        return owned;
      } finally {
        buying = false; status.busy = false; onBusy?.(false); changed();
      }
    },
  };
}
