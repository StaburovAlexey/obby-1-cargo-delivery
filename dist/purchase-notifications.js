import {SHOP_COSMETICS,SHOP_COIN_PRICE,SHOP_XP_PRICE} from './shop-cosmetics.js';
import {UPGRADE_STATS,getUpgradeOffer} from './vehicle-upgrades.js';
import {VEHICLE_NEON_CATALOG} from './vehicle-neon-catalog.js';
import {createUiCache} from './ui-cache.js';

export function getAffordablePurchases(gameplay){
 const s=gameplay.state,id=gameplay.getUpgradeVehicleId();
 const nitro=gameplay.getNitroOffer?.();
 const upgrade=!!nitro?.purchasable||(s.mode==='walking'||s.mode==='driving')&&!!id&&gameplay.isOwned(id)&&(
  UPGRADE_STATS.some(stat=>{const offer=getUpgradeOffer(id,stat.id,s.upgrades[id]);return !!offer&&!offer.maxed&&s.brains>=offer.price;})||
  !!gameplay.getTyreOffer(s.tyreTier+1)?.purchasable);
 const shop=SHOP_COSMETICS.some(item=>!item.free&&!item.premium&&
  (item.xp?s.brains>=SHOP_XP_PRICE:s.money>=SHOP_COIN_PRICE)&&!s.cosmetics.owned.includes(item.key)&&(item.type!=='livery'||gameplay.isOwned(item.vehicleId)))||VEHICLE_NEON_CATALOG.some(item=>item.currency==='coins'&&
  !s.ownedNeonIds.includes(item.id)&&s.money>=item.price);
 return {upgrade,shop};
}
const states=new WeakMap();
export function updatePurchaseNotifications(doc,{gameplay}){
 const s=gameplay.state,id=gameplay.getUpgradeVehicleId();
 // Modal state is deliberately absent: opening a window does not clear an offer.
 const key=JSON.stringify([s.mode,id,s.brains,s.money,s.upgrades[id],s.tyreTier,s.testMode,s.eventMode,
  s.nitroLevel,s.routeCompletion,id&&gameplay.isOwned(id),s.ownedNeonIds,s.cosmetics,s.ownedVehicleIds]);
 let cached=states.get(doc);
 if(cached?.gameplay!==gameplay||cached.key!==key){cached={gameplay,key,...getAffordablePurchases(gameplay)};states.set(doc,cached);}
 const ui=createUiCache(doc);
 ui.class(ui.get('upgrade-button'),'has-affordable-purchase',cached.upgrade);
 ui.class(ui.get('livery-shop-button'),'has-affordable-purchase',cached.shop);
}
