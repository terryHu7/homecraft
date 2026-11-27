import { buildGate } from './swarg-gate-model.js';
export const SWARG_EARTH={x:-25,y:80,z:-200};
export const RETURN_GATE={x:0,y:3,z:29};
export function createSwargGates(returning=false){
  const pos=returning?RETURN_GATE:SWARG_EARTH, dir=returning?-1:1, steps=returning?6:16;
  const id=returning?'return-gate':'swarg-enter', name=returning?'Return to Earth':'Enter Swarga';
  const root=buildGate(pos,returning?Math.PI:0,id,steps);
  const at=[pos.x,pos.z+dir*3.2];
  const site={levels(x,z,out){
    const lateral=Math.abs(x-pos.x), depth=(z-pos.z)*dir;
    if(lateral<7.75 && depth>=-4.45 && depth<4.35) out.push({y:pos.y,site:id});
    const tread=Math.floor((depth-4.01)/.9);
    if(lateral<3.9 && tread>=0 && tread<steps) out.push({y:pos.y-tread*.5,site:id,tread:true});
  }};
  return {root,pos,dir,site,planes:[root],targets:[{id,name,en:name,icon:'portal',at,floor:pos.y}],
    markers:[{id,label:returning?'EARTH':'SWARGA',x:at[0],z:at[1],y:pos.y}]};
}
