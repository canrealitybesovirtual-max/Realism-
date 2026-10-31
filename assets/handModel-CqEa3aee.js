import{C as e,Lt as t,U as n,Va as r,Wr as i,ca as a,ir as o,j as s,jt as c,pr as l,qt as u,ro as d,tr as f,ua as p}from"./three.core-Dp-eO7LC.js";var m=[`thumb`,`index`,`middle`,`ring`,`pinky`],h=(e,t,n,r,i,a=0)=>({thumb:e,index:t,middle:n,ring:r,pinky:i,spread:a}),g={relaxed:h([8,12,12,10],[14,18,10],[18,22,12],[22,26,14],[26,28,16],3),open:h([-5,0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],8),fist:h([22,38,38,40],[82,98,58],[84,100,60],[86,100,60],[88,98,58],0),point:h([20,34,30,32],[2,4,2],[80,98,58],[84,100,60],[86,98,58],0),gripController:h([18,28,20,18],[30,38,18],[70,82,44],[74,84,46],[76,82,44],0),pinch:h([20,38,26,28],[38,46,24],[52,64,36],[58,70,40],[62,72,42],0),mugHandle:h([8,18,14,20],[62,88,52],[66,92,56],[70,92,54],[64,76,42],0),book:h([34,52,8,4],[18,14,6],[20,16,6],[22,18,8],[24,20,10],2),pistolGrip:h([10,25,20,0],[6,30,12],[78,92,50],[82,92,50],[84,88,48],0),mouse:h([4,30,12,10],[22,22,12],[24,24,12],[34,36,18],[40,40,20],5)};function _(e,t,n,r){let i=r??structuredClone(e),a=(e,t)=>e+(t-e)*n;for(let n of m){let r=e[n],o=t[n],s=i[n];for(let e=0;e<r.length;e++)s[e]=a(r[e],o[e])}return i.spread=a(e.spread,t.spread),i}var v=[{name:`index`,base:[-.014,.004,-.012],mcp:[-.025,.002,-.088],lengths:[.041,.024,.021],radii:[.0098,.0088,.0079,.0068]},{name:`middle`,base:[-.003,.005,-.012],mcp:[-.004,.003,-.092],lengths:[.046,.028,.022],radii:[.0102,.0092,.0082,.007]},{name:`ring`,base:[.008,.004,-.012],mcp:[.016,.001,-.087],lengths:[.043,.027,.021],radii:[.0096,.0086,.0076,.0066]},{name:`pinky`,base:[.017,.002,-.01],mcp:[.034,-.004,-.077],lengths:[.033,.02,.019],radii:[.0085,.0076,.0068,.0058]}],y={cmc:[-.02,-.009,-.02],dir:new d(-.56,-.24,-.79).normalize(),lengths:[.046,.033,.028],radii:[.0138,.0118,.0104,.0084],nailUp:new d(-.62,.78,0)},b=[`wrist`,`thumb-metacarpal`,`thumb-phalanx-proximal`,`thumb-phalanx-distal`,...[`index`,`middle`,`ring`,`pinky`].flatMap(e=>[`${e}-finger-metacarpal`,`${e}-finger-phalanx-proximal`,`${e}-finger-phalanx-intermediate`,`${e}-finger-phalanx-distal`])],x={color:12884611,nail:14198167};function S(e,t,n){e.customProgramCacheKey=()=>`hand-`+t,e.onBeforeCompile=e=>{e.uniforms.uSide={value:n},e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
attribute vec4 aSkin; attribute vec3 aJd; attribute vec3 aKnuckle; varying vec4 vSkin; varying vec3 vJd; varying vec3 vKnuckle; varying vec3 vRest;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
vSkin = aSkin; vJd = aJd; vKnuckle = aKnuckle; vRest = position;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>

varying vec4 vSkin; varying vec3 vJd; varying vec3 vKnuckle; varying vec3 vRest; uniform float uSide;
float sdH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float sdN(vec3 p) {
	vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(sdH(i), sdH(i + vec3(1, 0, 0)), f.x), mix(sdH(i + vec3(0, 1, 0)), sdH(i + vec3(1, 1, 0)), f.x), f.y),
		mix(mix(sdH(i + vec3(0, 0, 1)), sdH(i + vec3(1, 0, 1)), f.x), mix(sdH(i + vec3(0, 1, 1)), sdH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float sdLine(float d, float w) { return exp(-d * d / (w * w)); }
vec3 sdPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
	vec3 sx = dFdx(surf_pos), sy = dFdy(surf_pos);
	vec3 r1 = cross(sy, surf_norm), r2 = cross(surf_norm, sx);
	float det = dot(sx, r1) * faceDir;
	vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
	return normalize(abs(det) * surf_norm - grad);
}`+(t===`skin`?`
float sdHeight(vec3 rp, vec4 sk, vec3 jd, vec3 knk, float fine, out float crease, out float dorsal) {
	dorsal = smoothstep(-0.3, 0.3, sk.y);
	crease = 0.0;
	if (sk.w < 0.5) {
		// palm: heart, head and life lines on the palm side
		float x = rp.x * uSide, z = rp.z;
		float heart = z - (-0.068 - 0.008 * sin((x + 0.015) / 0.057 * 3.14159));
		float headL = z - (-0.052 + (x + 0.035) * 0.3);
		float life = length(vec2(x + 0.062, z + 0.003)) - 0.061;
		float lines = sdLine(heart, 0.0006) * smoothstep(-0.018, -0.014, x) * smoothstep(0.042, 0.038, x)
			+ sdLine(headL, 0.0006) * smoothstep(-0.038, -0.034, x) * smoothstep(0.028, 0.024, x)
			+ sdLine(life, 0.00065) * smoothstep(-0.06, -0.056, z) * smoothstep(0.03, 0.026, z) * smoothstep(-0.042, -0.038, x);
		crease = (1.0 - dorsal) * clamp(lines, 0.0, 1.0);
	} else if (sk.w < 1.5) {
		float wob = 0.0005 * sin(rp.x * 1100.0 + rp.y * 700.0);
		for (int i = 0; i < 3; i++) {
			float d = jd[i];
			// palm side: one deep and one fainter flexion crease at each joint
			crease += (1.0 - dorsal) * (sdLine(d - 0.0007, 0.00045) + 0.6 * sdLine(d + 0.0013, 0.00045));
			// back: rounded wrinkles over the knuckle, wavy across the finger
			float w = knk[i] * dorsal * smoothstep(0.0058, 0.0018, abs(d));
			crease += w * pow(0.5 + 0.5 * cos((d + wob) / 0.0012 * 6.2831853), 3.0) * 0.75 * fine;
		}
	}
	crease = clamp(crease, 0.0, 1.0);
	float grain = sdN(rp * 1400.0) - 0.5;
	float pores = smoothstep(0.72, 0.95, sdN(rp * 2600.0 + 7.0));
	return -0.00018 * crease + fine * (0.00001 * grain - 0.000012 * pores);
}
float sdSkin(out float crease, out float dorsal, out float mott, out vec2 dH) {
	// aliasing guard: fade detail finer than about two pixels
	float fine = 1.0 - smoothstep(0.00025, 0.0007, length(fwidth(vRest)));
	mott = sdN(vRest * 160.0) * 0.6 + sdN(vRest * 420.0 + 3.0) * 0.4;
	float c1, d1;
	float h = sdHeight(vRest, vSkin, vJd, vKnuckle, fine, crease, dorsal);
	float hx = sdHeight(vRest + dFdx(vRest), vSkin + dFdx(vSkin), vJd + dFdx(vJd), vKnuckle, fine, c1, d1);
	float hy = sdHeight(vRest + dFdy(vRest), vSkin + dFdy(vSkin), vJd + dFdy(vJd), vKnuckle, fine, c1, d1);
	dH = vec2(hx - h, hy - h);
	return h;
}`:`
float sdSkin(out float crease, out float dorsal, out float mott, out vec2 dH) {
	crease = 0.0; dorsal = 1.0; mott = 0.5;
	// faint ridges running along the nail
	float fine = 1.0 - smoothstep(0.00025, 0.0006, length(fwidth(vRest)));
	float u = vSkin.y, ux = u + dFdx(u), uy = u + dFdy(u);
	float h = 0.000012 * fine * sin(u * 70.0);
	dH = vec2(0.000012 * fine * sin(ux * 70.0) - h, 0.000012 * fine * sin(uy * 70.0) - h);
	return h;
}`)).replace(`#include <map_fragment>`,`#include <map_fragment>
float sdCrease, sdDorsal, sdMott; vec2 sdDH; sdSkin(sdCrease, sdDorsal, sdMott, sdDH);
`+(t===`skin`?`
	{
		vec3 c = diffuseColor.rgb;
		c *= 0.94 + 0.12 * sdMott;
		// palm paler and pinker, back of the hand a touch darker
		c *= mix(vec3(1.05, 0.99, 0.97), vec3(0.97, 0.96, 0.955), sdDorsal);
		// redder over the knuckles and toward the fingertips
		float knuck = sdDorsal * max(vKnuckle.x * sdLine(vJd.x, 0.006), max(vKnuckle.y * sdLine(vJd.y, 0.006), vKnuckle.z * sdLine(vJd.z, 0.006)));
		float tip = vSkin.w > 0.5 ? smoothstep(0.72, 1.02, vSkin.x) : 0.0;
		c *= mix(vec3(1.0), vec3(1.03, 0.85, 0.83), clamp(knuck * 0.8 + tip * 0.55, 0.0, 1.0));
		c *= 1.0 - 0.24 * sdCrease;
		diffuseColor.rgb = c;
	}`:`
	{
		vec3 c = diffuseColor.rgb;
		float u = vSkin.y - 0.5, v = vSkin.x;
		// the pale half-moon at the base, the white free edge at the tip
		float lunula = 1.0 - smoothstep(0.24, 0.3, length(vec2(u * 0.9, v * 1.5)));
		c = mix(c, c * vec3(1.28, 1.2, 1.18), lunula * 0.65);
		c = mix(c, vec3(0.86, 0.81, 0.75), smoothstep(0.8, 0.9, v));
		diffuseColor.rgb = c;
	}`)).replace(`#include <roughnessmap_fragment>`,`#include <roughnessmap_fragment>
`+(t===`skin`?`roughnessFactor = clamp(mix(0.6, 0.47, sdDorsal) + 0.12 * sdCrease + 0.06 * (sdMott - 0.5), 0.3, 0.9);`:``)).replace(`#include <normal_fragment_maps>`,`#include <normal_fragment_maps>
normal = sdPerturb(-vViewPosition, normal, sdDH, faceDirection);`).replace(`#include <opaque_fragment>`,(t===`skin`?`outgoingLight += diffuseColor.rgb * vec3(0.16, 0.035, 0.02) * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5) * (vSkin.w > 0.5 ? 1.0 : 0.5);
`:``)+`#include <opaque_fragment>`)}}var C=class{handedness;root=new u;mesh;bones=[];restQ=[];restP=[];chain={thumb:[],index:[],middle:[],ring:[],pinky:[]};tipOffset={thumb:0,index:0,middle:0,ring:0,pinky:0};current=structuredClone(g.relaxed);sign;constructor(e){this.handedness=e,this.sign=e===`right`?1:-1,this.root.name=`hand-${e}`;let{geometry:t,groups:r}=this.build(),i=new l({name:`skin`,color:x.color,roughness:.52,sheen:.35,sheenRoughness:.6,sheenColor:new n(16751226)}),o=new l({name:`nail`,color:x.nail,roughness:.38,clearcoat:.35,clearcoatRoughness:.3});S(i,`skin`,this.sign),S(o,`nail`,this.sign),t.clearGroups();for(let e of r)t.addGroup(e.start,e.count,e.mat);this.mesh=new p(t,[i,o]),this.mesh.castShadow=!0,this.mesh.frustumCulled=!1,this.mesh.add(this.bones[0]),this.mesh.bind(new a(this.bones)),this.root.add(this.mesh),this.setPose(g.relaxed)}build(){let n=this.sign,a=e=>new d(e[0]*n,e[1],e[2]),c=new d(0,1,0),l=[],u=[],p=[],m=(e,t)=>{let n=e.clone().normalize().negate(),r=new d().crossVectors(t,n).normalize(),a=new d().crossVectors(n,r).normalize();return new i().setFromRotationMatrix(new o().makeBasis(r,a,n))},h=(e,t,n)=>(l.push(e.clone()),u.push(t.clone()),p.push(n),l.length-1);h(new d,new i,-1);let g=[];{let e=y.dir.clone();e.x*=n;let t=y.nailUp.clone();t.x*=n;let r=m(e,t),i=a(y.cmc),o=i.clone().addScaledVector(e,y.lengths[0]),s=o.clone().addScaledVector(e,y.lengths[1]),c=s.clone().addScaledVector(e,y.lengths[2]),l=h(i,r,0),u=h(o,r,l),d=h(s,r,u);this.chain.thumb=[l,u,d],this.tipOffset.thumb=y.lengths[2],g.push({pts:[i,o,s,c],radii:[...y.radii],bones:[l,u,d],up:t,startInside:.004,nail:!0})}for(let e of v){let t=a(e.base),n=a(e.mcp),r=n.clone().sub(t),i=r.clone().normalize(),o=m(i,c),s=n.clone().addScaledVector(i,e.lengths[0]),l=s.clone().addScaledVector(i,e.lengths[1]),u=l.clone().addScaledVector(i,e.lengths[2]),d=h(t,m(r,c),0),f=h(n,o,d),p=h(s,o,f),_=h(l,o,p);this.chain[e.name]=[d,f,p,_],this.tipOffset[e.name]=e.lengths[2],g.push({pts:[n,s,l,u],radii:[...e.radii],bones:[f,p,_],up:c,startInside:.014,nail:!0})}for(let t=0;t<l.length;t++){let n=new e;if(n.name=b[t],p[t]<0)n.position.copy(l[t]),n.quaternion.copy(u[t]);else{let e=u[p[t]].clone().invert();n.position.copy(l[t]).sub(l[p[t]]).applyQuaternion(e),n.quaternion.copy(e).multiply(u[t]),this.bones[p[t]].add(n)}this.bones.push(n),this.restQ.push(n.quaternion.clone()),this.restP.push(n.position.clone())}let _=[],x=[],S=[],C=[],w=[],T=[],E=[],D=[],O=[],k=[],A=[0,0,1,0],j=[1,1,1],M=[0,0,0],N=(e,t,n,r,i=1)=>(_.push(e.x,e.y,e.z),x.push(0,0,0),S.push(1,1,1,i),C.push(t,n,0,0),w.push(1-r,r,0,0),D.push(A[0],A[1],A[2],A[3]),O.push(j[0],j[1],j[2]),k.push(M[0],M[1],M[2]),_.length/3-1);for(let e of g){let t=[e.pts[1].distanceTo(e.pts[0]),e.pts[2].distanceTo(e.pts[1]),e.pts[3].distanceTo(e.pts[2])],n=t[0]+t[1]+t[2],r=[0,t[0],t[0]+t[1],n],i=t=>{let n=t<r[1]?0:t<r[2]?1:2;return e.pts[n+1].clone().sub(e.pts[n]).normalize()},a=n=>{if(n<=0)return e.pts[0].clone().addScaledVector(i(0),n);let a=n<r[1]?0:n<r[2]?1:2;return e.pts[a].clone().lerp(e.pts[a+1],(n-r[a])/t[a])},o=n=>{let i=Math.max(0,n<r[1]?0:n<r[2]?1:2),a=f.clamp((n-r[i])/t[i],0,1),o=f.lerp(e.radii[i],e.radii[i+1],a);for(let e of[r[1],r[2]])o+=7e-4*Math.exp(-(((n-e)/.004)**2));return o},s=t=>{let n=.004,i=[this.bones[e.bones[0]].parent?this.bones.indexOf(this.bones[e.bones[0]].parent):0,...e.bones],a=[0,r[1],r[2]];for(let e=a.length-1;e>=0;e--)if(t>=a[e]-n){let r=f.smoothstep(t,a[e]-n,a[e]+n);return[i[e],i[e+1],r]}return[i[0],i[0],0]},c=[],l=e.startInside<.01,u=l?[r[1],r[2],1]:[t[0]*.3,r[1],r[2]],p=l?[.8,.6,0]:[0,1,.55],m=e=>u.map(t=>e-t),h=-e.startInside,g=n;for(let t=0;t<=30;t++){let r=h+(g-h)*(t/30),l=a(r),u=i(Math.max(0,r)),f=o(Math.max(0,r)),_=new d().crossVectors(e.up,u.clone().negate()).normalize(),v=new d().crossVectors(u.clone().negate(),_).normalize(),[y,b,x]=s(r),S=[];j=m(r),M=p;for(let e=0;e<14;e++){let t=e/14*Math.PI*2;A=[r/n,Math.sin(t),1,1];let i=Math.sin(t)>0?.84:.92,a=l.clone().addScaledVector(_,Math.cos(t)*f).addScaledVector(v,Math.sin(t)*f*i);S.push(N(a,y,b,x))}c.push(S)}let v=i(n),y=e.pts[3],b=e.bones[e.bones.length-1];for(let t=1;t<=5;t++){let r=t/5*(Math.PI/2),i=e.radii[3]*Math.cos(r),a=y.clone().addScaledVector(v,e.radii[3]*.95*Math.sin(r)),o=new d().crossVectors(e.up,v.clone().negate()).normalize(),s=new d().crossVectors(v.clone().negate(),o).normalize(),l=[];j=m(n+e.radii[3]*Math.sin(r));for(let t=0;t<14;t++){let c=t/14*Math.PI*2;A=[1+e.radii[3]*Math.sin(r)/n,Math.sin(c),1,1];let u=Math.sin(c)>0?.84:.92;l.push(N(a.clone().addScaledVector(o,Math.cos(c)*Math.max(i,1e-4)).addScaledVector(s,Math.sin(c)*Math.max(i,1e-4)*u),b,b,0))}c.push(l)}for(let e=0;e<c.length-1;e++)for(let t=0;t<14;t++){let n=c[e][t],r=c[e][(t+1)%14],i=c[e+1][t],a=c[e+1][(t+1)%14];T.push(n,i,r,r,i,a)}{let t=c[0],n=new d;for(let e of t)n.add(new d(_[e*3],_[e*3+1],_[e*3+2]));n.divideScalar(t.length).addScaledVector(i(0),-.004);let[r,a,o]=s(-e.startInside);A=[0,-1,1,1],j=m(-e.startInside);let l=N(n,r,a,o);for(let e=0;e<14;e++)T.push(l,t[e],t[(e+1)%14])}if(e.nail){let s=r[2]+t[2]*.32,c=n+e.radii[3]*.35,l=[];for(let t=0;t<=5;t++){let r=s+(c-s)*(t/5),u=Math.min(r,n),f=a(u).addScaledVector(v,Math.max(0,r-n)),p=o(u)*(r>n?Math.cos((r-n)/e.radii[3]*1.2):1)+35e-5,m=i(u),h=new d().crossVectors(e.up,m.clone().negate()).normalize(),g=new d().crossVectors(m.clone().negate(),h).normalize(),_=[];for(let e=0;e<=6;e++){let n=Math.PI/2+.75*(e/6*2-1);A=[t/5,e/6,1,2],j=[1,1,1],M=[0,0,0],_.push(N(f.clone().addScaledVector(h,Math.cos(n)*p).addScaledVector(g,Math.sin(n)*p*.84),b,b,0))}l.push(_)}for(let e=0;e<5;e++)for(let t=0;t<6;t++){let n=l[e][t],r=l[e][t+1],i=l[e+1][t],a=l[e+1][t+1];E.push(n,r,i,r,a,i)}}}{let e=this.chain.thumb[0],t=[{z:.05,w:.004,h:.003,cx:0,cy:-.002,a:1},{z:.047,w:.034,h:.025,cx:0,cy:-.002,a:1},{z:.04,w:.05,h:.036,cx:0,cy:-.002,a:1},{z:.03,w:.055,h:.038,cx:0,cy:-.002,a:1},{z:.012,w:.058,h:.035,cx:0,cy:-.003,a:1},{z:-.012,w:.066,h:.034,cx:-.001,cy:-.004,a:1},{z:-.04,w:.078,h:.032,cx:.002,cy:-.004,a:1},{z:-.066,w:.084,h:.03,cx:.004,cy:-.003,a:1},{z:-.084,w:.083,h:.026,cx:.004,cy:-.001,a:1},{z:-.093,w:.07,h:.018,cx:.004,cy:0,a:1},{z:-.097,w:.04,h:.008,cx:.004,cy:0,a:1}],r=[],i=[l[e],l[e].clone().addScaledVector(new d(y.dir.x*n,y.dir.y,y.dir.z),y.lengths[0])],a=(e,t,n)=>{let r=n.clone().sub(t),i=f.clamp(e.clone().sub(t).dot(r)/r.lengthSq(),0,1);return e.distanceTo(t.clone().addScaledVector(r,i))};for(let o of t){let t=[];for(let r=0;r<28;r++){let s=r/28*Math.PI*2;A=[o.z,Math.sin(s),1,0],j=[1,1,1],M=[0,0,0];let c=Math.cos(s),l=Math.sin(s),u=2.6,p=Math.sign(c)*Math.abs(c)**(2/u)*o.w/2,m=Math.sign(l)*Math.abs(l)**(2/u)*o.h/2,h=new d((o.cx+p)*1,o.cy+m,o.z);h.x=o.cx*n+p;let g=a(h,i[0],i[1]),_=h.x*n<0&&o.z<.01?.75*f.smoothstep(-g,-.03,-.012):0;t.push(N(h,0,e,_,o.a))}r.push(t)}for(let e=0;e<r.length-1;e++)for(let t=0;t<28;t++){let n=r[e][t],i=r[e][(t+1)%28],a=r[e+1][t],o=r[e+1][(t+1)%28];T.push(n,i,a,i,o,a)}}if(n<0)for(let e of[T,E])for(let t=0;t<e.length;t+=3)[e[t+1],e[t+2]]=[e[t+2],e[t+1]];let P=new s;return P.setAttribute(`position`,new t(_,3)),P.setAttribute(`normal`,new t(x,3)),P.setAttribute(`color`,new t(S,4)),P.setAttribute(`skinIndex`,new r(C,4)),P.setAttribute(`skinWeight`,new t(w,4)),P.setAttribute(`aSkin`,new t(D,4)),P.setAttribute(`aJd`,new t(O,3)),P.setAttribute(`aKnuckle`,new t(k,3)),P.setIndex([...T,...E]),P.computeVertexNormals(),{geometry:P,groups:[{start:0,count:T.length,mat:0},{start:T.length,count:E.length,mat:1}]}}_q=new i;_e=new c;setPose(e){e!==this.current&&_(e,e,0,this.current);let t=f.DEG2RAD,n=this.sign,r=(e,r,i=0,a=0)=>{let o=this.bones[e];o.position.copy(this.restP[e]),this._e.set(-r*t,i*t*n,a*t*n,`YXZ`),o.quaternion.copy(this.restQ[e]).multiply(this._q.setFromEuler(this._e))},[i,a,o,s]=e.thumb,[c,l,u]=this.chain.thumb;r(c,i,-a*.55,-a*.6),r(l,o),r(u,s);let d={index:-1,middle:0,ring:.7,pinky:1.6};for(let t of[`index`,`middle`,`ring`,`pinky`]){let[n,i,a,o]=this.chain[t];this.bones[n].quaternion.copy(this.restQ[n]),this.bones[n].position.copy(this.restP[n]);let[s,c,l]=e[t];r(i,s,-(e.spread*d[t]*(1-Math.min(1,s/70)))),r(a,c),r(o,l)}}setFromJoints(e,t){let n=[],r=new o,i=new o;for(let a=0;a<this.bones.length;a++){let o=e[b[a]],s=this.bones[a];if(!o||!o.visible){s.updateMatrix(),n.push(a===0?s.matrix.clone():n[this.parentIndex(a)].clone().multiply(s.matrix));continue}let c=t.clone().multiply(o.matrixWorld);n.push(c);let l=a===0?r.identity():n[this.parentIndex(a)];i.copy(l).invert(),i.multiply(c).decompose(s.position,s.quaternion,new d)}}parentIdx=null;parentIndex(e){return this.parentIdx??=this.bones.map(e=>this.bones.indexOf(e.parent)),this.parentIdx[e]}jointsWorld(e,t){let n=this.chain[e],r=e===`thumb`?[n[0],n[0],n[1],n[2]]:n;for(let e=0;e<4;e++)t[e].setFromMatrixPosition(this.bones[r[e]].matrixWorld);return this.tipWorld(e,t[4]),t}tipWorld(e,t=new d){let n=this.chain[e],r=this.bones[n[n.length-1]];return r.updateWorldMatrix(!0,!1),t.set(0,0,-this.tipOffset[e]).applyMatrix4(r.matrixWorld)}fingerDir(e,t=new d){let n=this.chain[e],r=this.bones[n[n.length-1]];return r.updateWorldMatrix(!0,!1),t.set(0,0,-1).transformDirection(r.matrixWorld)}};export{g as n,_ as r,C as t};