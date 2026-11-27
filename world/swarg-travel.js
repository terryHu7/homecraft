import * as THREE from 'three';
import { createSwargSound } from './swarg-sound.js';

export function setupGateTravel({stage,world,player,rig,sound},returning=false){
  const gate=world.swargGates, camera=stage.camera, audio=createSwargSound({sound});
  const focus=new THREE.Vector3(), shot=new THREE.Vector3(), turn=new THREE.Quaternion();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let initial=0, clock=0, blend=0, tracking=false, leaving=false, armed=true;
  let crane=document.documentElement.classList.contains('gate-arrival') && !reduced.matches ? (returning ? 3.5 : 8) : 0;
  const distance=()=>Math.hypot(player.pos.x-gate.pos.x,player.pos.z-gate.pos.z,player.y-gate.pos.y);
  const banks=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),gate.root.userData.clouds.material,32);
  banks.visible=false;stage.scene.add(banks);
  function release(){
    tracking=false;
    banks.visible=false;
    document.documentElement.classList.remove('gate-flight');
  }
  addEventListener('keydown',release,true);
  addEventListener('pointerdown',release,true);
  function cross(){
    if(leaving)return;
    leaving=true;release();
    document.documentElement.classList.add('gate-light');
    setTimeout(()=>location.assign(returning?'./?arrive=swarga':'./?world=swarga&arrive=gate'),450);
  }
  addEventListener('pageshow',event=>{
    if(event.persisted){leaving=false;armed=false;blend=0;release();document.documentElement.classList.remove('gate-light');}
  });
  return {
    interactionTargets:gate.targets,
    navigationTargets:()=>gate.markers,
    handlesInteraction:id=>id===gate.targets[0].id,
    interact(id){if(id!==gate.targets[0].id)return false;cross();return true;},
    onNavigationTarget(){
      crane=0;
      initial=Math.max(1,distance());tracking=!reduced.matches;
      if(!tracking)return;
      document.documentElement.classList.add('gate-flight');
      banks.visible=true;
      const puff=new THREE.Object3D();
      for(let i=0;i<banks.count;i++){
        const t=(i+.5)/banks.count;
        puff.position.set(THREE.MathUtils.lerp(player.pos.x,gate.pos.x,t)+Math.sin(i*2.4)*12,
          THREE.MathUtils.lerp(player.y,gate.pos.y,t)+4*Math.sin(i),THREE.MathUtils.lerp(player.pos.z,gate.pos.z,t));
        puff.scale.set(10+i%6,4,1); puff.updateMatrix();banks.setMatrixAt(i,puff.matrix);
      }
      banks.instanceMatrix.needsUpdate=true;banks.computeBoundingSphere();
      if(sound.on)audio.transition();
    },
    update(dt){
      clock+=dt;
      if(crane>0 && window.__home){
        if(rig.introActive)rig.skipIntro();
        crane=Math.max(0,crane-dt);
        const t=THREE.MathUtils.smoothstep(crane,0,returning?3.5:8);
        if(returning){camera.position.y+=t*9;camera.position.z+=t*5;}
        else {
          shot.set(gate.pos.x+4,gate.pos.y+5,gate.pos.z+10);
          camera.position.lerp(shot,t);
          camera.position.x+=12*Math.sin(Math.PI*t);
        }
        turn.copy(camera.quaternion);camera.lookAt(player.pos.x,player.y+1.25,player.pos.z);
        camera.quaternion.slerp(turn,1-t);
      }
      audio.update(dt,player,returning);
      gate.root.userData.bells.rotation.x=.065*Math.sin(clock*.9);
      const cloud=gate.root.userData.clouds;
      cloud.position.x=Math.sin(clock*.18)*.8;
      gate.root.userData.aura.scale.setScalar(1+.045*Math.sin(clock*1.1));
      const remaining=distance();
      const opening=1-THREE.MathUtils.smoothstep(remaining,2,22);
      gate.root.userData.leaves[0].rotation.y=-.97-opening*.48;
      gate.root.userData.leaves[1].rotation.y=.97+opening*.48;
      if(remaining>2)armed=true;
      if(armed && Math.abs(player.pos.x-gate.pos.x)<2 && Math.abs(player.pos.z-gate.pos.z)<.7 && Math.abs(player.y-gate.pos.y)<1.4)cross();
      if(tracking && remaining<4.6){release();rig.recenter(player,true);}
      blend=THREE.MathUtils.damp(blend,tracking?1:0,2.8,dt);
      gate.root.userData.sparks.rotation.y=clock*.12;
      if(blend<.001)return;
      const phase=1-THREE.MathUtils.clamp(remaining/initial,0,1);
      const lift=Math.sin(Math.PI*phase);
      shot.set(player.pos.x+5*lift,player.y+2.5+4*lift,player.pos.z+gate.dir*(6+3*lift+12*phase));
      focus.set(player.pos.x,player.y+1.6,player.pos.z);
      focus.x+=(gate.pos.x-focus.x)*phase;
      focus.y+=(gate.pos.y+6-focus.y)*phase;
      focus.z+=(gate.pos.z-focus.z)*phase;
      turn.copy(camera.quaternion);
      camera.position.lerp(shot,blend);
      camera.lookAt(focus);camera.quaternion.slerp(turn,1-blend);
    }
  };
}
