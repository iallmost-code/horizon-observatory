(function () {
  'use strict';
  const planets = [
    ['Mercury', '#aaa29a', 4, 88, 'A small, cratered world closest to the Sun.'],
    ['Venus', '#e5bb7e', 7, 225, 'A rocky world wrapped in thick, bright clouds.'],
    ['Earth', '#4f9fd5', 8, 365, 'Our ocean world, with clouds and a thin atmosphere.'],
    ['Mars', '#c46a45', 6, 687, 'A rust-colored desert world with polar ice.'],
    ['Jupiter', '#d8b18c', 22, 4333, 'The largest planet, striped with immense cloud bands.'],
    ['Saturn', '#e1cca1', 18, 10759, 'An immense gas planet surrounded by rings of ice and rock.'],
    ['Uranus', '#9fdcdb', 12, 30687, 'A pale blue ice giant that rotates on its side.'],
    ['Neptune', '#437ce4', 12, 60190, 'A deep blue ice giant in the outer Solar System.']
  ];
  const button = document.createElement('button');
  button.className = 'icon-pill glass-panel'; button.textContent = 'Solar System';
  document.querySelector('.action-cluster').prepend(button);
  const panel = document.createElement('section');
  panel.className = 'solar-explorer hidden'; panel.setAttribute('aria-label', 'Solar System explorer');
  panel.innerHTML = `<canvas aria-label="Solar System, drag to pan and scroll to zoom"></canvas>
    <header class="solar-header"><div><div class="solar-eyebrow">HORIZON / SPACE EXPLORER</div><h1>Our corner of the universe.</h1><p>THE SOLAR SYSTEM</p></div><button class="solar-return">Return to black hole ↗</button></header>
    <aside class="solar-info"><div class="solar-eyebrow">SELECTED WORLD</div><h2>The Sun</h2><p class="solar-description">The star at the center of our Solar System. Eight planets travel around it.</p><div class="solar-period">OUR HOME STAR</div></aside>
    <nav class="solar-planets" aria-label="Choose a planet"><button data-planet="-1" class="active">Sun</button>${planets.map((p,i)=>`<button data-planet="${i}"><i style="background:${p[1]}"></i>${p[0]}</button>`).join('')}</nav>
    <footer class="solar-footer"><div><button class="solar-pause">Pause orbits</button><button class="solar-reset">Reset view</button></div><span>DRAG TO EXPLORE · SCROLL TO ZOOM</span><small>Illustrative view · sizes, distances and orbital speeds compressed</small></footer>`;
  document.body.append(panel);
  const canvas = panel.querySelector('canvas'), ctx = canvas.getContext('2d');
  let active = false, paused = false, zoom = 1, pan = {x:0,y:0}, drag = null, selected = -1;
  let width = 0, height = 0, time = 0, last = 0, raf = 0, previousFocus;
  let seed = 1947;
  function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  const stars = Array.from({length:1800},()=>({x:random(),y:random(),r:random()<.035?1.5:.3+random()*.65,a:.15+random()*.8,t:random()}));
  const asteroids = Array.from({length:650},()=>({a:random()*Math.PI*2,r:230+random()*28,s:.25+random()*.7}));
  const textures = planets.map((p,index)=>{
    const c=document.createElement('canvas');c.width=c.height=160;const g=c.getContext('2d');
    g.fillStyle=p[1];g.fillRect(0,0,160,160);
    for(let y=0;y<160;y++) {g.fillStyle=`rgba(${index===2?'20,80,100':'65,37,20'},${.03+random()*(index>3?.24:.1)})`;g.fillRect(0,y,160,1+random()*3);}
    if(index===2){for(let j=0;j<38;j++){g.fillStyle=j%3?'#427e62':'#96aa6c';g.beginPath();g.ellipse(random()*160,random()*160,3+random()*15,2+random()*9,random()*3,0,7);g.fill();}}
    for(let j=0;j<180;j++){g.fillStyle=index===2?`rgba(255,255,255,${random()*.4})`:`rgba(25,20,18,${random()*.12})`;g.beginPath();g.ellipse(random()*160,random()*160,1+random()*6,1+random()*2,0,0,7);g.fill();}
    return c;
  });
  function resize(){width=innerWidth;height=innerHeight;const d=Math.min(devicePixelRatio||1,2);canvas.width=width*d;canvas.height=height*d;ctx.setTransform(d,0,0,d,0,0);}
  function select(index){selected=index; const p=planets[index];panel.querySelector('h2').textContent=p?p[0]:'The Sun';panel.querySelector('.solar-description').textContent=p?p[4]:'The star at the center of our Solar System. Eight planets travel around it.';panel.querySelector('.solar-period').textContent=p?`ORBITAL PERIOD · ${p[3].toLocaleString()} EARTH DAYS`:'OUR HOME STAR';panel.querySelectorAll('[data-planet]').forEach(b=>b.classList.toggle('active',Number(b.dataset.planet)===index));}
  function open(){previousFocus=document.activeElement;active=true;document.body.classList.add('solar-open');panel.classList.remove('hidden');resize();last=performance.now();raf=requestAnimationFrame(frame);panel.querySelector('.solar-return').focus();}
  function close(){active=false;cancelAnimationFrame(raf);panel.classList.add('hidden');document.body.classList.remove('solar-open');previousFocus?.focus();}
  button.addEventListener('click',open);panel.querySelector('.solar-return').addEventListener('click',close);
  panel.querySelectorAll('[data-planet]').forEach(b=>b.addEventListener('click',()=>select(Number(b.dataset.planet))));
  panel.querySelector('.solar-pause').addEventListener('click',e=>{paused=!paused;e.target.textContent=paused?'Resume orbits':'Pause orbits';});
  panel.querySelector('.solar-reset').addEventListener('click',()=>{zoom=1;pan={x:0,y:0};select(-1);});
  window.addEventListener('resize',()=>{if(active)resize();});
  window.addEventListener('keydown',e=>{if(active){e.stopImmediatePropagation();if(e.key==='Escape')close();}},true);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.45,Math.min(3.5,zoom*Math.exp(-e.deltaY*.001)));},{passive:false});
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(drag){pan.x+=e.clientX-drag.x;pan.y+=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};}});
  canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
  function frame(now){if(!active)return;const dt=Math.min(.05,(now-last)/1000);last=now;if(!paused)time+=dt;
    ctx.fillStyle='#02050b';ctx.fillRect(0,0,width,height);
    const nebula=ctx.createRadialGradient(width*.65,height*.45,0,width*.65,height*.45,width*.65);nebula.addColorStop(0,'#111c3028');nebula.addColorStop(1,'#00000000');ctx.fillStyle=nebula;ctx.fillRect(0,0,width,height);
    stars.forEach(s=>{ctx.globalAlpha=s.a;ctx.fillStyle=s.t>.85?'#ffd5a1':'#c5dbff';ctx.beginPath();ctx.arc(s.x*width,s.y*height,s.r,0,7);ctx.fill();});ctx.globalAlpha=1;
    const scale=Math.min(width/1450,height/850)*zoom,cx=width*.57+pan.x,cy=height*.53+pan.y;
    ctx.save();ctx.translate(cx,cy);ctx.scale(scale,scale);
    const orbitR=[73,110,152,195,295,365,435,505];
    orbitR.forEach((r,i)=>{ctx.strokeStyle=i===selected?'#a5c8e466':'#7399c021';ctx.lineWidth=1/scale;ctx.beginPath();ctx.ellipse(0,0,r,r*.59,-.12,0,Math.PI*2);ctx.stroke();});
    asteroids.forEach(a=>{const angle=a.a+time*.007;ctx.fillStyle='#a5b2c04d';ctx.fillRect(Math.cos(angle)*a.r,Math.sin(angle)*a.r*.59,a.s,a.s);});
    const corona=ctx.createRadialGradient(0,0,12,0,0,90);corona.addColorStop(0,'#fff5c9');corona.addColorStop(.28,'#ffb344bb');corona.addColorStop(.5,'#ff791c30');corona.addColorStop(1,'#f7520000');ctx.fillStyle=corona;ctx.beginPath();ctx.arc(0,0,90,0,7);ctx.fill();
    const sun=ctx.createRadialGradient(-8,-8,0,0,0,27);sun.addColorStop(0,'#fffce4');sun.addColorStop(.65,'#ffdc7f');sun.addColorStop(1,'#f59527');ctx.fillStyle=sun;ctx.beginPath();ctx.arc(0,0,27,0,7);ctx.fill();
    planets.forEach((p,i)=>{const angle=i*2.39+.4+time*(.16/Math.pow(i+1,.85));const ox=Math.cos(angle)*orbitR[i],oy=Math.sin(angle)*orbitR[i]*.59;const x=ox*Math.cos(-.12)-oy*Math.sin(-.12),y=ox*Math.sin(-.12)+oy*Math.cos(-.12),r=p[2];ctx.save();ctx.translate(x,y);
      if(i===5){ctx.strokeStyle='#cbb88a80';ctx.lineWidth=7;ctx.beginPath();ctx.ellipse(0,0,r*1.95,r*.65,-.35,0,7);ctx.stroke();}
      ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.clip();ctx.drawImage(textures[i],-r,-r,r*2,r*2);const shade=ctx.createLinearGradient(-x/Math.hypot(x,y)*r,-y/Math.hypot(x,y)*r,x/Math.hypot(x,y)*r,y/Math.hypot(x,y)*r);shade.addColorStop(0,'#ffffff18');shade.addColorStop(.45,'#00000015');shade.addColorStop(1,'#000000ec');ctx.fillStyle=shade;ctx.fillRect(-r,-r,r*2,r*2);ctx.restore();
      if(i===selected){ctx.strokeStyle='#d4e9ffbb';ctx.lineWidth=1/scale;ctx.beginPath();ctx.arc(0,0,r+6,0,7);ctx.stroke();}
      ctx.font=`${11/Math.max(.8,scale)}px Segoe UI`;ctx.textAlign='center';ctx.fillStyle=i===selected?'#fff':'#a7bacd';ctx.fillText(p[0].toUpperCase(),0,r+22);ctx.restore();});
    ctx.restore();raf=requestAnimationFrame(frame);
  }
})();
