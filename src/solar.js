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
  panel.innerHTML = `<canvas aria-label="Solar System, drag to orbit and scroll to zoom"></canvas>
    <header class="solar-header"><div><div class="solar-eyebrow">HORIZON / SPACE EXPLORER</div><h1>Worlds beyond the horizon.</h1><p>THE SOLAR SYSTEM</p></div><button class="solar-return">Return to black hole ↗</button></header>
    <aside class="solar-info"><div class="solar-eyebrow">SELECTED WORLD</div><h2>The Sun</h2><p class="solar-description">The star at the center of our Solar System. Eight planets travel around it.</p><div class="solar-period">OUR HOME STAR</div></aside>
    <nav class="solar-planets" aria-label="Choose a planet"><button data-planet="-1" class="active">Sun</button>${planets.map((p,i)=>`<button data-planet="${i}"><i style="background:${p[1]}"></i>${p[0]}</button>`).join('')}</nav>
    <footer class="solar-footer"><div><button class="solar-pause">Pause orbits</button><button class="solar-reset">Reset view</button></div><span>DRAG TO ORBIT · SCROLL TO ZOOM</span><small>Illustrative view · sizes, distances and orbital speeds compressed</small></footer>`;
  document.body.append(panel);
  const canvas = panel.querySelector('canvas'); let renderer; let yaw=.3,pitch=.48;
  let active = false, paused = false, zoom = 1, pan = {x:0,y:0}, drag = null, selected = -1;
  let width = 0, height = 0, time = 0, last = 0, raf = 0, previousFocus;
  function resize(){width=innerWidth;height=innerHeight;const d=Math.min(devicePixelRatio||1,2);canvas.width=width*d;canvas.height=height*d;}
  function select(index){selected=index; const p=planets[index];panel.querySelector('h2').textContent=p?p[0]:'The Sun';panel.querySelector('.solar-description').textContent=p?p[4]:'The star at the center of our Solar System. Eight planets travel around it.';panel.querySelector('.solar-period').textContent=p?`ORBITAL PERIOD · ${p[3].toLocaleString()} EARTH DAYS`:'OUR HOME STAR';panel.querySelectorAll('[data-planet]').forEach(b=>b.classList.toggle('active',Number(b.dataset.planet)===index));}
  function open(){if(!renderer){try{renderer=new window.SolarRenderer(canvas);}catch(error){console.error(error);button.textContent="WebGL unavailable";return;}}previousFocus=document.activeElement;active=true;document.body.classList.add('solar-open');panel.classList.remove('hidden');resize();last=performance.now();raf=requestAnimationFrame(frame);panel.querySelector('.solar-return').focus();}
  function close(){active=false;cancelAnimationFrame(raf);panel.classList.add('hidden');document.body.classList.remove('solar-open');previousFocus?.focus();}
  button.addEventListener('click',open);panel.querySelector('.solar-return').addEventListener('click',close);
  panel.querySelectorAll('[data-planet]').forEach(b=>b.addEventListener('click',()=>select(Number(b.dataset.planet))));
  panel.querySelector('.solar-pause').addEventListener('click',e=>{paused=!paused;e.target.textContent=paused?'Resume orbits':'Pause orbits';});
  panel.querySelector('.solar-reset').addEventListener('click',()=>{zoom=1;yaw=.3;pitch=.48;select(-1);});
  window.addEventListener('resize',()=>{if(active)resize();});
  window.addEventListener('keydown',e=>{if(active){e.stopImmediatePropagation();if(e.key==='Escape')close();}},true);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.45,Math.min(3.5,zoom*Math.exp(-e.deltaY*.001)));},{passive:false});
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(drag){yaw-=(e.clientX-drag.x)*.005;pitch=Math.max(-1.35,Math.min(1.35,pitch+(e.clientY-drag.y)*.005));drag={x:e.clientX,y:e.clientY};}});
  canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
  function frame(now){if(!active)return;const dt=Math.min(.05,(now-last)/1000);last=now;if(!paused)time+=dt;
    renderer.render(time,selected,zoom,yaw,pitch);raf=requestAnimationFrame(frame);
  }
})();
