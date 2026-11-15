(function () {
 'use strict';
 const fragment = `#version 300 es
 precision highp float;
 out vec4 color;
 uniform vec2 resolution;
 uniform vec3 eye, target;
 uniform float time;
 uniform vec4 bodies[32];
 uniform int bodyCount;
 uniform vec3 lightOrigin;
 float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
 float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 float fbm(vec3 p){float a=.5,v=0.;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+7.1;a*=.5;}return v;}
 float sphere(vec3 ro,vec3 rd,vec4 s){vec3 oc=ro-s.xyz;float b=dot(oc,rd),h=b*b-dot(oc,oc)+s.w*s.w;if(h<0.)return 1e5;float t=-b-sqrt(h);return t>0.?t:1e5;}
 vec3 stars(vec3 d){
 // A fixed galactic sky: camera rotation reveals new sky rather than sliding a backdrop.
 // The normal places the galactic plane across the opening camera composition.
 vec3 axis=normalize(vec3(.22,.78,-.49));
 float latitude=dot(d,axis);
 float turbulence=fbm(d*6.5);
 float detail=fbm(d*32.+turbulence*2.);
 float warped=latitude+(turbulence-.5)*.15;
 float broad=exp(-pow(warped*4.4,2.));
 float ribbon=exp(-pow(warped*12.,2.));
 vec3 coreDirection=normalize(vec3(-.35,-.34,-.87));
 float core=pow(max(0.,dot(d,coreDirection)),14.);
 float cloud=smoothstep(.22,.74,turbulence)*(.45+detail);
 // Branching foreground dust breaks up the luminous stellar clouds.
 float lane=exp(-pow((warped+(detail-.5)*.075)*38.,2.));
 float veins=smoothstep(.44,.65,fbm(d*19.+vec3(5.,1.,8.)));
 float extinction=1.-lane*(.65+.25*veins);
 vec3 col=vec3(.0003,.0005,.0012);
 col+=vec3(.013,.022,.055)*broad*cloud;
 col+=mix(vec3(.07,.085,.15),vec3(.21,.145,.08),core)*ribbon*cloud*extinction;
 col+=vec3(.14,.105,.06)*core*broad*extinction;
 // Dense fine stars in the galactic plane, sparse larger stars everywhere else.
 for(int i=0;i<4;i++){
 float scale=90.+float(i)*135.;vec3 p=d*scale,id=floor(p),f=fract(p)-.5;
 float h=hash(id),presence=mix(.993,.86,ribbon*extinction);
 vec3 offset=(vec3(hash(id+1.),hash(id+2.),hash(id+3.))-.5)*.65;
 float distanceToStar=length(f-offset);
 float pixelWidth=max(.017,scale/resolution.y*.42);
 float energy=exp(-distanceToStar*distanceToStar/(pixelWidth*pixelWidth));
 float brightness=mix(.12,1.6,pow(hash(id+6.),9.));
 vec3 tint=mix(vec3(.62,.76,1.),vec3(1.,.77,.48),hash(id+5.));
 col+=tint*energy*step(presence,h)*brightness;
 }
 return col;
 }
 vec3 surface(int id,vec3 n){float a=time*.018;mat2 rot=mat2(cos(a),-sin(a),sin(a),cos(a));n.xz=rot*n.xz;float f=fbm(n*5.),fine=fbm(n*35.);vec3 c;
 if(id>=9){float rock=fbm(n*28.);float craters=pow(max(0.,noise(n*65.)-.45),2.);vec3 base=mix(vec3(.14,.13,.12),vec3(.64,.61,.55),f);return base*(.65+rock*.5)-craters*.3;}
 if(id==0){float cells=fbm(n*28.+time*.025);return mix(vec3(1.,.16,.015),vec3(1.,.8,.26),cells)*3.;}
 if(id==1)c=mix(vec3(.15,.13,.11),vec3(.52,.48,.43),fine);
 else if(id==2)c=mix(vec3(.45,.25,.09),vec3(.93,.75,.43),fbm(n*8.+vec3(f*5.)));
 else if(id==3){float land=smoothstep(.48,.54,f);c=mix(vec3(.012,.065,.16),mix(vec3(.08,.18,.08),vec3(.37,.32,.16),fine),land);float ice=smoothstep(.86,.96,abs(n.y)+fine*.08);c=mix(c,vec3(.83,.91,.94),ice);float clouds=smoothstep(.53,.68,fbm(n*9.+vec3(f*4.)+vec3(time*.006,0,0)));c=mix(c,vec3(.92),clouds*.88);}
 else if(id==4)c=mix(vec3(.22,.065,.025),vec3(.68,.32,.14),f+fine*.2);
 else if(id==5||id==6){float wave=sin(n.y*65.+fbm(n*7.)*9.);float bands=smoothstep(-.8,.8,wave);c=id==5?mix(vec3(.34,.16,.075),vec3(.85,.71,.52),bands):mix(vec3(.45,.34,.18),vec3(.85,.76,.52),bands*.55+f*.4);if(id==5){float storm=exp(-pow((n.y+.23)*17.,2.)-pow((atan(n.z,n.x)-.6)*4.,2.));c=mix(c,vec3(.55,.2,.09),storm*.8);}}
 else if(id==7)c=mix(vec3(.13,.45,.49),vec3(.53,.79,.79),f);
 else c=mix(vec3(.025,.08,.3),vec3(.08,.3,.75),f+sin(n.y*40.+f*8.)*.08);
 return c;}
 void main(){vec2 uv=(gl_FragCoord.xy-.5*resolution)/resolution.y;vec3 fw=normalize(target-eye),right=normalize(cross(fw,vec3(0,1,0))),up=cross(right,fw);vec3 rd=normalize(fw+right*uv.x*.78+up*uv.y*.78);vec3 col=stars(rd);float closest=1e5;int hit=-1;
 for(int i=0;i<32;i++){if(i>=bodyCount)break;float t=sphere(eye,rd,bodies[i]);if(t<closest){closest=t;hit=i;}}
 // Ring plane is tilted in 3D. Planet intersections naturally occlude its back half.
 vec3 sn=normalize(vec3(.18,1.,.3)),sc=bodies[6].xyz;float den=dot(rd,sn);float rt=dot(sc-eye,sn)/den;
 if(bodies[6].w>0.&&abs(den)>.0001&&rt>0.&&rt<closest){vec3 rp=eye+rd*rt-sc;float r=length(rp)/bodies[6].w;if(r>1.28&&r<2.45){float bands=.55+.18*sin(r*210.)+.12*sin(r*530.);float gap=1.-.85*exp(-pow((r-1.93)*65.,2.));vec3 ring=mix(vec3(.28,.22,.14),vec3(.73,.65,.48),bands);vec3 ld=normalize(-sc);float shadow=sphere(eye+rd*rt+ld*.01,ld,bodies[6])<1e4?.08:1.;col=mix(col,ring*shadow*(.25+.75*abs(dot(sn,ld))),gap*.88);}}
 if(hit>=0){vec3 p=eye+rd*closest,n=normalize(p-bodies[hit].xyz);vec3 albedo=surface(hit,n);if(hit==0)col=albedo;else{vec3 ld=normalize(lightOrigin-p);float light=max(0.,dot(n,ld));float visibility=1.;for(int j=1;j<32;j++){if(j>=bodyCount)break;if(j==hit)continue;if(sphere(p+n*.002,ld,bodies[j])<1e4)visibility=0.;}light*=visibility;float rim=pow(1.-max(0.,dot(n,-rd)),4.);col=albedo*(.009+light*1.8);if(hit==3||hit==7||hit==8)col+=vec3(.07,.28,.63)*rim*pow(max(0.,dot(n,ld)+.3),1.4)*.65;}}
 // Atmospheric scattering outside the silhouette, and the Sun's optical corona.
 for(int i=0;i<9;i++){vec3 v=bodies[i].xyz-eye;float t=dot(v,rd);if(t>0.&&t<closest+bodies[i].w*2.){float d=length(v-rd*t)/bodies[i].w;if(i==0){float glow=exp(-max(0.,d-1.)*2.8)*.5+exp(-max(0.,d-1.)*.45)*.035;if(hit!=0)col+=vec3(1.,.4,.08)*glow;}else if((i==3||i>6)&&d>1.)col+=vec3(.07,.28,.62)*exp(-(d-1.)*65.)*.23;}}
 col=col/(col+vec3(.8));col=pow(col,vec3(1./2.2));float vignette=1.-.16*dot(uv,uv);color=vec4(col*vignette,1.);}
 `;
 window.SolarRenderer=class {
 constructor(canvas){this.canvas=canvas;const gl=this.gl=canvas.getContext('webgl2',{antialias:false,alpha:false});if(!gl)throw Error('Solar System requires WebGL2');const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};this.program=gl.createProgram();gl.attachShader(this.program,compile(gl.VERTEX_SHADER,`#version 300 es
 void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}`));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));this.u={};['resolution','eye','target','time','bodies','bodyCount','lightOrigin'].forEach(n=>this.u[n]=gl.getUniformLocation(this.program,n));this.target=[0,0,0];this.distance=90;this.yaw=.3;this.pitch=.48;this.focus=-1;}
 render(time,selected,zoom,yaw,pitch,system=false,moonIndex=-1){
 const gl=this.gl,rings=[7,11,16,22,34,47,61,74],sizes=[.6,1,1.1,.85,3.5,2.9,1.9,1.85],periods=[87.969,224.701,365.256,686.98,4332.589,10759.22,30685.4,60189.];
 const data=new Float32Array(128);data.set([0,0,0,4]);const days=time/24;
 for(let i=0;i<8;i++){const a=i*2.39+.4+days*2*Math.PI/periods[i];data.set([Math.cos(a)*rings[i],0,Math.sin(a)*rings[i],sizes[i]],(i+1)*4);}
 let goal=[0,0,0],dist=140,count=9,light=[0,0,0];
 if(selected>=0){goal=Array.from(data.slice((selected+1)*4,(selected+1)*4+3));dist=sizes[selected]*(selected===5?10:7);}
 if(system&&selected>=0){const source=window.SolarMoons,local=source.moons.filter(m=>m.parent===selected),rKm=source.planetRadiiKm[selected],unit=sizes[selected]/rKm;const old=goal.slice();light=old.map(v=>-v*10000);for(let i=0;i<9;i++)data.set([1e6,1e6,1e6,0],i*4);data.set([0,0,0,sizes[selected]],(selected+1)*4);goal=[0,0,0];dist=Math.max(sizes[selected]*8,...local.map(m=>m.aKm*(1+m.e)*unit*2.9));
 local.forEach((m,i)=>{const pos=source.position(m,days).map(v=>v*unit);data.set([...pos,m.radiusKm*unit],(9+i)*4);if(i===moonIndex){goal=pos;dist=Math.max(m.radiusKm*unit*8,.012);}});count=9+local.length;
 }
 // In the full overview, every major moon shares the planetary clock.
 // Only this overview compresses lunar distances to keep each system readable.
 if(!system){window.SolarMoons.moons.forEach((m,i)=>{const parent=m.parent+1,pr=sizes[m.parent],rKm=window.SolarMoons.planetRadiiKm[m.parent];const scale=pr*(2.8+Math.log1p(m.aKm/rKm)*.8)/m.aKm;const pos=window.SolarMoons.position(m,days).map((v,k)=>v*scale+data[parent*4+k]);data.set([...pos,m.radiusKm/rKm*pr],(9+i)*4);});count=9+window.SolarMoons.moons.length;}
 const key=selected+':'+system+':'+moonIndex;if(key!==this.lastView){this.lastView=key;this.target=goal.slice();this.distance=dist/zoom;}else{for(let k=0;k<3;k++)this.target[k]+=(goal[k]-this.target[k])*.12;this.distance+=(dist/zoom-this.distance)*.08;}
 const eye=[this.target[0]+Math.sin(yaw)*Math.cos(pitch)*this.distance,this.target[1]+Math.sin(pitch)*this.distance,this.target[2]+Math.cos(yaw)*Math.cos(pitch)*this.distance];
 gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.useProgram(this.program);gl.uniform2f(this.u.resolution,this.canvas.width,this.canvas.height);gl.uniform3fv(this.u.eye,eye);gl.uniform3fv(this.u.target,this.target);gl.uniform1f(this.u.time,time);gl.uniform3fv(this.u.lightOrigin,light);gl.uniform1i(this.u.bodyCount,count);gl.uniform4fv(this.u.bodies,data);gl.drawArrays(gl.TRIANGLES,0,3);
 this.drawOrbits(eye,data,count,days,selected,system,moonIndex,sizes);
 }
 drawOrbits(eye,data,count,days,selected,system,moonIndex,sizes){
 if(!this.overlay){this.overlay=document.createElement('canvas');this.overlay.className='solar-orbit-overlay';this.overlay.setAttribute('aria-hidden','true');this.canvas.after(this.overlay);this.context=this.overlay.getContext('2d');}
 const c=this.overlay,ctx=this.context,w=this.canvas.width,h=this.canvas.height;if(c.width!==w||c.height!==h){c.width=w;c.height=h;}ctx.clearRect(0,0,w,h);
 if(system&&moonIndex>=0)return;
 const norm=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 const fw=norm(this.target.map((v,i)=>v-eye[i])),right=norm(cross(fw,[0,1,0])),up=cross(right,fw);
 const project=p=>{const v=p.map((x,i)=>x-eye[i]),z=dot(v,fw);if(z<=0)return null;return [w*.5+dot(v,right)/z/.78*h,h*.5-dot(v,up)/z/.78*h,z];};
 const source=window.SolarMoons,list=source.moons.filter(m=>!system||m.parent===selected),dpr=Math.min(devicePixelRatio||1,2);
 list.forEach((m,i)=>{const parent=m.parent+1,pr=sizes[m.parent],rKm=source.planetRadiiKm[m.parent],center=Array.from(data.slice(parent*4,parent*4+3));const scale=system?pr/rKm:pr*(2.8+Math.log1p(m.aKm/rKm)*.8)/m.aKm;
 ctx.strokeStyle=system?'rgba(169,203,229,.34)':'rgba(169,203,229,.19)';ctx.lineWidth=.65*dpr;ctx.beginPath();let pen=false;
 for(let j=0;j<=100;j++){const q=project(source.position(m,m.periodDays*j/100).map((v,k)=>v*scale+center[k]));if(q){if(pen)ctx.lineTo(q[0],q[1]);else ctx.moveTo(q[0],q[1]);pen=true;}else pen=false;}ctx.stroke();
 const q=project(source.position(m,days).map((v,k)=>v*scale+center[k]));if(!q)return;
 // Screen-space locator, not an enlarged physical moon. Occlude behind the parent.
 const pc=project(center);if(pc){const radius=pr/pc[2]/.78*h;if(q[2]>pc[2]&&Math.hypot(q[0]-pc[0],q[1]-pc[1])<radius)return;}
 ctx.strokeStyle='rgba(207,226,244,.8)';ctx.lineWidth=.7*dpr;ctx.beginPath();ctx.arc(q[0],q[1],3*dpr,0,Math.PI*2);ctx.stroke();
 });
 }

 };
})();
