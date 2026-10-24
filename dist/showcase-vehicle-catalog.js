// Explicit URLs are bundled as local assets on every supported platform.
export const SHOWCASE_VEHICLES=Object.freeze([
 {id:'bmwe30',name:'BMW E30',model:'bmw-e30',rotation:-Math.PI/2,url:new URL('./assets/optimized/vehicles/showcase/bmw-e30.glb',import.meta.url).href},
 {id:'cadillac75',name:'Cadillac 75',model:'cadillac-75',rotation:Math.PI,url:new URL('./assets/optimized/vehicles/showcase/cadillac-75.glb',import.meta.url).href},
 {id:'koenigseggone1',name:'Koenigsegg One:1',model:'koenigsegg-one1',rotation:Math.PI,url:new URL('./assets/optimized/vehicles/showcase/koenigsegg-one1.glb',import.meta.url).href},
 {id:'phoenixinterceptor',name:'Phoenix Interceptor',model:'phoenix-interceptor',rotation:Math.PI/2,url:new URL('./assets/optimized/vehicles/showcase/phoenix-interceptor.glb',import.meta.url).href},
].map(Object.freeze));
export const isShowcaseVehicle=id=>SHOWCASE_VEHICLES.some(vehicle=>vehicle.id===id);
