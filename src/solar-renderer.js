(function () {
 'use strict';
 const fragment = `#version 300 es
 precision highp float;
 out vec4 color;
 uniform vec2 resolution;
 uniform vec3 eye, target;
 uniform float time;
 uniform vec4 bodies[9];
 float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
 float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 float fbm(vec3 p){float a=.5,v=0.;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+7.1;a*=.5;}return v;}
 float sphere(vec3 ro,vec3 rd,vec4 s){vec3 oc=ro-s.xyz;float b=dot(oc,rd),h=b*b-dot(oc,oc)+s.w*s.w;if(h<0.)return 1e5;float t=-b-sqrt(h);return t>0.?t:1e5;}
 vec3 stars(vec3 d){vec3 col=vec3(.0005,.0008,.002);for(int i=0;i<3;i++){float scale=120.+float(i)*170.;vec3 p=d*scale,id=floor(p),f=fract(p)-.5;float h=hash(id);float s=length(f-(vec3(hash(id+1.),hash(id+2.),hash(id+3.))-.5)*.6);float star=exp(-s*s*1800.)*step(.975,h);col+=mix(vec3(.7,.82,1.),vec3(1.,.7,.43),hash(id+5.))*star*(1.+hash(id+6.)*4.);}
 float band=exp(-pow(dot(d,normalize(vec3(.3,1.,.5)))*6.,2.));float dust=fbm(d*9.);col+=vec3(.025,.035,.065)*band*dust*dust;return col;}
 vec3 surface(int id,vec3 n){float a=time*.018;mat2 rot=mat2(cos(a),-sin(a),sin(a),cos(a));n.xz=rot*n.xz;float f=fbm(n*5.),fine=fbm(n*35.);vec3 c;
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
 for(int i=0;i<9;i++){float t=sphere(eye,rd,bodies[i]);if(t<closest){closest=t;hit=i;}}
 // Ring plane is tilted in 3D. Planet intersections naturally occlude its back half.
 vec3 sn=normalize(vec3(.18,1.,.3)),sc=bodies[6].xyz;float den=dot(rd,sn);float rt=dot(sc-eye,sn)/den;
 if(abs(den)>.0001&&rt>0.&&rt<closest){vec3 rp=eye+rd*rt-sc;float r=length(rp)/bodies[6].w;if(r>1.28&&r<2.45){float bands=.55+.18*sin(r*210.)+.12*sin(r*530.);float gap=1.-.85*exp(-pow((r-1.93)*65.,2.));vec3 ring=mix(vec3(.28,.22,.14),vec3(.73,.65,.48),bands);vec3 ld=normalize(-sc);float shadow=sphere(eye+rd*rt+ld*.01,ld,bodies[6])<1e4?.08:1.;col=mix(col,ring*shadow*(.25+.75*abs(dot(sn,ld))),gap*.88);}}
 if(hit>=0){vec3 p=eye+rd*closest,n=normalize(p-bodies[hit].xyz);vec3 albedo=surface(hit,n);if(hit==0)col=albedo;else{vec3 ld=normalize(-p);float light=max(0.,dot(n,ld));float rim=pow(1.-max(0.,dot(n,-rd)),4.);col=albedo*(.009+light*1.8);if(hit==3||hit==7||hit==8)col+=vec3(.07,.28,.63)*rim*pow(max(0.,dot(n,ld)+.3),1.4)*.65;}}
 // Atmospheric scattering outside the silhouette, and the Sun's optical corona.
 for(int i=0;i<9;i++){vec3 v=bodies[i].xyz-eye;float t=dot(v,rd);if(t>0.&&t<closest+bodies[i].w*2.){float d=length(v-rd*t)/bodies[i].w;if(i==0){float glow=exp(-max(0.,d-1.)*2.8)*.5+exp(-max(0.,d-1.)*.45)*.035;if(hit!=0)col+=vec3(1.,.4,.08)*glow;}else if((i==3||i>6)&&d>1.)col+=vec3(.07,.28,.62)*exp(-(d-1.)*65.)*.23;}}
 col=col/(col+vec3(.8));col=pow(col,vec3(1./2.2));float vignette=1.-.16*dot(uv,uv);color=vec4(col*vignette,1.);}
 `;
 window.SolarRenderer=class {
 constructor(canvas){this.canvas=canvas;const gl=this.gl=canvas.getContext('webgl2',{antialias:false,alpha:false});if(!gl)throw Error('Solar System requires WebGL2');const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};this.program=gl.createProgram();gl.attachShader(this.program,compile(gl.VERTEX_SHADER,`#version 300 es
 void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}`));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));this.u={};['resolution','eye','target','time','bodies'].forEach(n=>this.u[n]=gl.getUniformLocation(this.program,n));this.target=[0,0,0];this.distance=90;this.yaw=.3;this.pitch=.48;this.focus=-1;}
 render(time,selected,zoom,yaw,pitch){const gl=this.gl;const rings=[7,11,16,22,34,47,61,74],sizes=[.6,1,1.1,.85,3.5,2.9,1.9,1.85];const data=[0,0,0,4];for(let i=0;i<8;i++){const a=i*2.39+.4+time*.025/Math.pow(i+1,.85);data.push(Math.cos(a)*rings[i],0,Math.sin(a)*rings[i],sizes[i]);}let goal=[0,0,0],dist=100;if(selected>=0){goal=data.slice((selected+1)*4,(selected+1)*4+3);dist=sizes[selected]*(selected===5?10:7);}for(let k=0;k<3;k++)this.target[k]+=(goal[k]-this.target[k])*.07;this.distance+=(dist/zoom-this.distance)*.07;const eye=[this.target[0]+Math.sin(yaw)*Math.cos(pitch)*this.distance,this.target[1]+Math.sin(pitch)*this.distance,this.target[2]+Math.cos(yaw)*Math.cos(pitch)*this.distance];gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.useProgram(this.program);gl.uniform2f(this.u.resolution,this.canvas.width,this.canvas.height);gl.uniform3fv(this.u.eye,eye);gl.uniform3fv(this.u.target,this.target);gl.uniform1f(this.u.time,time);gl.uniform4fv(this.u.bodies,new Float32Array(data));gl.drawArrays(gl.TRIANGLES,0,3);}
 };
})();
