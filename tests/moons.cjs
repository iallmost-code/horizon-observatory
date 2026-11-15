const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync('src/moons.js','utf8'),sandbox);
const {moons,position}=sandbox.window.SolarMoons;assert.equal(moons.length,21);
for(const m of moons){assert(m.radiusKm>0&&m.aKm>m.radiusKm&&m.periodDays>0&&m.e>=0&&m.e<1);const p=position(m,0),q=position(m,m.periodDays);assert(Math.hypot(...p.map((v,i)=>v-q[i]))<1e-5,m.name+' closes after one period');for(let d=0;d<1;d+=.1){const r=Math.hypot(...position(m,d*m.periodDays));assert(r>=m.aKm*(1-m.e)-1e-5&&r<=m.aKm*(1+m.e)+1e-5,m.name+' elliptical range');}}
const triton=moons.find(m=>m.name==='Triton');assert(triton.inclinationDeg>90);assert.equal(moons.filter(m=>m.parent===0||m.parent===1).length,0);
console.log('21 sourced moons: Kepler period closure, elliptical radial bounds, valid dimensions, and Triton retrograde inclination verified.');
