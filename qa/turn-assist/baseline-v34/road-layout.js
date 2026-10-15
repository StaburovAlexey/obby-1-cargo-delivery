
export * from './route-network.js';
import {routePointAtProgress,FORKS} from './route-network.js';

export const routeCenter=q=>routePointAtProgress(q).x;
export const routeSlope=q=>-Math.tan(routePointAtProgress(q).heading);
export const branchCenter=(id,q)=>routePointAtProgress(q,{branch:id==='left'?'alternate':'primary'}).x;
export const branchHeight=(id,q)=>routePointAtProgress(q,{branch:id==='left'?'alternate':'primary'}).height;
export const branchSpread=q=>Math.abs(branchCenter('left',q)-branchCenter('right',q))/2;
export const JUNCTION_X=0,ROAD_SPLIT_Y=null,ROAD_GAPS=Object.freeze([]);
export const NETWORK_FORKS=FORKS;
