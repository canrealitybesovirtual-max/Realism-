const CMPT=(typeof COMPACT_MODE!=='undefined')&&COMPACT_MODE;
// ================= WORLD GENERATOR: core =================
'use strict';
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
let R=mulberry32(245);
const rnd=(a=0,b=1)=>a+(b-a)*R();
const chance=p=>R()<p;
const pick=a=>a[Math.floor(R()*a.length)];
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const PI=Math.PI, HP=PI/2;

const COL={
  con:[0.57,0.57,0.54], conL:[0.68,0.67,0.63], conD:[0.40,0.41,0.40], wet:[0.32,0.33,0.32],
  panel:[0.63,0.62,0.58], teal:[0.36,0.55,0.53], green:[0.44,0.56,0.42], white:[0.83,0.82,0.77],
  rust:[0.52,0.28,0.15], orange:[0.72,0.42,0.19], red:[0.62,0.16,0.12], brick:[0.53,0.31,0.24],
  asph:[0.25,0.26,0.26], steel:[0.36,0.37,0.38], blue:[0.42,0.52,0.62], ochre:[0.63,0.51,0.31],
  glass:[0.22,0.27,0.29], dark:[0.17,0.17,0.17], wood:[0.42,0.31,0.21], yellow:[0.74,0.62,0.22],
  lamp:[1,0.97,0.86], mosaicB:[0.25,0.38,0.62]
};

// ---------------- MATERIALS (atlas tile ids; 255 = emissive) ----------------
const MAT={concrete:0,concreteL:1,concreteD:2,wet:3,paint:4,plaster:5,rust:6,steel:7,brick:8,asphalt:9,wood:10,glass:11,metalPaint:12,dark:13,tile:14,water:15,grass:16,dirt:17,bank:18,rock:19,forest:20,floor:21,wallpaper:22,parquet:23,fabric:24};
const MATID=new Map([[COL.con,MAT.concrete],[COL.panel,MAT.concrete],[COL.conL,MAT.concreteL],[COL.conD,MAT.concreteD],[COL.wet,MAT.wet],
  [COL.teal,MAT.paint],[COL.green,MAT.paint],[COL.blue,MAT.paint],[COL.white,MAT.plaster],[COL.rust,MAT.rust],[COL.steel,MAT.steel],[COL.brick,MAT.brick],
  [COL.asph,MAT.asphalt],[COL.wood,MAT.wood],[COL.glass,MAT.glass],[COL.red,MAT.metalPaint],[COL.ochre,MAT.metalPaint],[COL.yellow,MAT.metalPaint],[COL.orange,MAT.metalPaint],
  [COL.dark,MAT.dark],[COL.mosaicB,MAT.tile]]);
function matOf(col,o){if(o&&o.e)return 255;if(o&&o.m!=null)return o.m;const m=MATID.get(col);if(m!=null)return m;const r=col[0],g=col[1],b=col[2];if(r>g*1.25&&r>b*1.4)return MAT.rust;if(r+g+b<0.6)return MAT.concreteD;return MAT.concrete;}
const LAMPS=[];
// ---------------- TERRAIN ----------------
const RIV=CMPT?[[-3000,5000],[3000,5000]]:[[-560,-300],[-452,-300],[-300,-290],[-100,-300],[100,-288],[300,-276],[560,-292],[800,-290],[1200,-300]];const RIV0=-452;
function riverX(z){
  if(z<=RIV[0][0])return RIV[0][1];
  for(let i=1;i<RIV.length;i++){if(z<=RIV[i][0]){const z0=RIV[i-1][0],x0=RIV[i-1][1],z1=RIV[i][0],x1=RIV[i][1];const t=(z-z0)/(z1-z0);return x0+(x1-x0)*t*t*(3-2*t);}}
  return RIV[RIV.length-1][1];
}
const riverDepth=z=>5+11*clamp((z+450)/1000,0,1);
const RES_BASIN={x0:-440,x1:-160,z1:-452};
function riverHalf(z){return {top:30+50*sstep(-390,-450,z), bed:16+10*sstep(-400,-450,z)};}
const PADS=[
  {x0:-75,x1:140,z0:-185,z1:95,y:0},{x0:-465,x1:-445,z0:30,z1:82,y:0},{x0:308,x1:353,z0:-520,z1:-450,y:0},
  {x0:348,x1:404,z0:-560,z1:-405,y:0},{x0:42,x1:142,z0:205,z1:275,y:0},{x0:-540,x1:-468,z0:-57,z1:17,y:0},
  {x0:76,x1:174,z0:-360,z1:-300,y:0},{x0:205,x1:560,z0:-250,z1:365,y:-3,b:40},{x0:-460,x1:-140,z0:-480,z1:-412,y:42,b:40},
  {x0:-362,x1:-222,z0:-272,z1:-248,y:0,b:26},{x0:-358,x1:-218,z0:88,z1:112,y:0,b:26},{x0:-346,x1:-206,z0:288,z1:312,y:0,b:26},{x0:-355,x1:-235,z0:-130,z1:-110,y:0,b:26},
  {x0:-180,x1:-80,z0:210,z1:280,y:0},{x0:218,x1:282,z0:-456,z1:-404,y:0}
];
function hills(x,z){return 8*Math.sin(x*0.0062+0.8)*Math.cos(z*0.0071-1.1)+5*Math.sin(x*0.0137+z*0.0101+2.0)+3*Math.cos(x*0.026-z*0.021)+1.4*Math.sin(x*0.051+z*0.043);}
function padW(p,x,z){const dx=Math.max(p.x0-x,0,x-p.x1),dz=Math.max(p.z0-z,0,z-p.z1),b=p.b||28;if(dx>=b||dz>=b)return 0;return 1-sstep(0,b,Math.hypot(dx,dz));}
function baseH(x,z,noRiver){
  if(CMPT)return 4+hills(x,z)*0.18;
  const cdx=Math.max(-190-x,0,x-190),cdz=Math.max(-205-z,0,z-195);
  const amp=lerp(0.4,1.6,sstep(0,110,Math.hypot(cdx,cdz)));
  let h=hills(x,z)*amp+4;
  const nb=sstep(-385,-452,z),nx=sstep(-70,-145,x)*sstep(-660,-570,x);
  h=lerp(h,42+hills(x,z)*0.4,nb*nx);
  const dx=x-470,dz=z+290;h+=52*Math.exp(-(dx*dx+dz*dz)/6500);
  h-=20*sstep(430,560,z);
  const e=Math.max(Math.abs(x),Math.abs(z));
  h+=(Math.sin(x*0.021+Math.cos(z*0.013))+Math.sin(z*0.017+x*0.006))*3*sstep(560,720,e);
  h=lerp(h,30,sstep(700,900,e));
  for(let i=0;i<PADS.length;i++){const p=PADS[i];const w=padW(p,x,z);if(w>0)h=lerp(h,p.y,w);}
  if(z<RES_BASIN.z1&&x>RES_BASIN.x0&&x<RES_BASIN.x1)h=Math.min(h,6+1.5*Math.sin(x*0.05)*Math.sin(z*0.07));
  if(z>RIV0&&!noRiver){
    const rx=riverX(z),d=Math.abs(x-rx),rh=riverHalf(z);
    const bedH=-riverDepth(z)+0.6*Math.sin(z*0.05+x*0.1);
    const t=sstep(rh.top,rh.bed,d);
    h=Math.min(h,lerp(h,bedH,t));
  }
  return h;
}
const CUTS=[]; // {x0,x1,z0,z1,fn|y}
const CUT_GRID=new Map(),CUT_BIG=[],CG=50;
CUTS.push=function(c){Array.prototype.push.call(this,c);if((c.x1-c.x0)*(c.z1-c.z0)>40000){CUT_BIG.push(c);return;}
  for(let i=Math.floor(c.x0/CG);i<=Math.floor(c.x1/CG);i++)for(let k=Math.floor(c.z0/CG);k<=Math.floor(c.z1/CG);k++){const key=i*10007+k;let L=CUT_GRID.get(key);if(!L){L=[];CUT_GRID.set(key,L);}L.push(c);}};
const HOLES=[]; // oriented rects removed from the ground mesh: {cx,cz,ux,uz,hl,hw}
function addHole(cx,cz,ux,uz,hl,hw){HOLES.push({cx,cz,ux,uz,hl,hw});}
function inHole(x,z){for(const h of HOLES){const dx=x-h.cx,dz=z-h.cz;if(Math.abs(dx*h.ux+dz*h.uz)<=h.hl&&Math.abs(-dx*h.uz+dz*h.ux)<=h.hw)return true;}return false;}
// ---- engineered roads (profiles) and building pads ----
const RPROF=[];          // {ax,az,ux,uz,L,core,ys,tun,cutOnly}
const BP_GRID=new Map(),BP_C=50;
const BPADS=[];
function addBPad(a,y,bmin,margin){
  const p={x0:a.x0,x1:a.x1,z0:a.z0,z1:a.z1,y,b:bmin||9,m:margin==null?4:margin,ob:a.ohx!=null?{cx:a.ocx,cz:a.ocz,c:a.oc,s:a.os,hx:a.ohx,hz:a.ohz}:null};BPADS.push(p);const m=34;
  for(let i=Math.floor((a.x0-m)/BP_C);i<=Math.floor((a.x1+m)/BP_C);i++)for(let k=Math.floor((a.z0-m)/BP_C);k<=Math.floor((a.z1+m)/BP_C);k++){const key=i*10007+k;let L=BP_GRID.get(key);if(!L){L=[];BP_GRID.set(key,L);}L.push(p);}
}
const ACC_BUF=[];
function applyBPads(x,z,h){
  const L=BP_GRID.get(Math.floor(x/BP_C)*10007+Math.floor(z/BP_C));if(!L)return h;
  const acc=ACC_BUF;acc.length=0;
  for(let i=0;i<L.length;i++){const p=L[i];let d,dep;
    if(p.ob){const o=p.ob,ddx=x-o.cx,ddz=z-o.cz,u=Math.abs(ddx*o.c+ddz*o.s),v=Math.abs(-ddx*o.s+ddz*o.c);d=Math.hypot(Math.max(u-o.hx,0),Math.max(v-o.hz,0));dep=Math.min(o.hx-u,o.hz-v);}
    else{const dx=Math.max(p.x0-x,0,x-p.x1),dz=Math.max(p.z0-z,0,z-p.z1);d=Math.hypot(dx,dz);dep=Math.min(x-p.x0,p.x1-x,z-p.z0,p.z1-z);}
    if(d<=0)acc.push([3+dep/1000,1,p.y]);
    else if(d<=p.m)acc.push([2-0.9*d/p.m,1,p.y]);
    else{const b=Math.max(p.b,Math.abs(h-p.y)*1.5),dd=d-p.m;if(dd<b)acc.push([1-dd/b,1-sstep(0,b,dd),p.y]);}}
  if(!acc.length)return h;acc.sort((a,b)=>a[0]-b[0]);for(const [,w,y] of acc)h=lerp(h,y,w);return h;
}
function roadAt(R,x,z){ // returns [y,d,tunnel]
  const dx=x-R.ax,dz=z-R.az;let t=dx*R.ux+dz*R.uz;
  if(t<-R.core-40||t>R.L+R.core+40)return null;
  const lat=Math.abs(-dx*R.uz+dz*R.ux);if(lat>R.core+40)return null;
  const tc=clamp(t,0,R.L),px=R.ax+R.ux*tc,pz=R.az+R.uz*tc,d=Math.hypot(x-px,z-pz);
  const fi=tc/R.step,i=Math.min(R.ys.length-2,Math.floor(fi)),f=fi-i;
  return [lerp(R.ys[i],R.ys[i+1],f),d,R.tun[Math.round(fi)]===1];
}
function roadShape(x,z,h,coreOnly){
  if(!RPROF.length)return h;
  if(z>RIV0){const rh=riverHalf(z);if(Math.abs(x-riverX(z))<rh.top+3)return h;}
  let bw=0,by=0;
  for(let i=0;i<RPROF.length;i++){const R=RPROF[i];if(R._bb===undefined){const m=R.core+40,ex=R.ax+R.ux*R.L,ez=R.az+R.uz*R.L;R._bb=[Math.min(R.ax,ex)-m-1,Math.max(R.ax,ex)+m+1,Math.min(R.az,ez)-m-1,Math.max(R.az,ez)+m+1];}
    const bb=R._bb;if(x<bb[0]||x>bb[1]||z<bb[2]||z>bb[3])continue;const r=roadAt(R,x,z);if(!r||r[2])continue;const [y,d]=r;
    if(R.cutOnly&&h<y-1.6)continue;
    let w;if(coreOnly)w=d<=R.core?1:0;else{const b=Math.max(8,Math.abs(h-y)*1.5);w=d<=R.core?1:1-sstep(R.core,R.core+b,d);}
    if(w>bw){bw=w;by=R.cutOnly?y-1.6:y-0.06;}}
  return bw>0?lerp(h,by,bw):h;
}
const GD_GRID=new Map();
const GUARD_MARK=[];
function addGuard(ax,az,ya,bx,bz,yb,w,hh){const g={ax,az,ya,bx,bz,yb,w,hh,L:Math.hypot(bx-ax,bz-az)||1};g.ux=(bx-ax)/g.L;g.uz=(bz-az)/g.L;const m=w/2+2;
  for(let s=0;s<=g.L;s+=3){const t=s/g.L;if(baseH(lerp(ax,bx,t),lerp(az,bz,t))<lerp(ya,yb,t)+hh+1.5){GUARD_MARK.push(g);break;}}
  for(let i=Math.floor((Math.min(ax,bx)-m)/BP_C);i<=Math.floor((Math.max(ax,bx)+m)/BP_C);i++)for(let k=Math.floor((Math.min(az,bz)-m)/BP_C);k<=Math.floor((Math.max(az,bz)+m)/BP_C);k++){const key=i*10007+k;let L=GD_GRID.get(key);if(!L){L=[];GD_GRID.set(key,L);}L.push(g);}}
function applyGuards(x,z,h){const L=GD_GRID.get(Math.floor(x/BP_C)*10007+Math.floor(z/BP_C));if(!L)return h;
  for(const g of L){const t=(x-g.ax)*g.ux+(z-g.az)*g.uz;if(t<-0.5||t>g.L+0.5)continue;if(Math.abs(-(x-g.ax)*g.uz+(z-g.az)*g.ux)>g.w/2+1.6)continue;const y=lerp(g.ya,g.yb,clamp(t/g.L,0,1));if(h>y-0.7&&h<y+g.hh+0.8)h=y+g.hh+0.8;}return h;}
function H(x,z){
  let h=baseH(x,z);
  h=roadShape(x,z,h,false);
  h=applyBPads(x,z,h);
  h=applyGuards(x,z,h);
  h=roadShape(x,z,h,true);
  for(let i=0;i<CUT_BIG.length;i++){const c=CUT_BIG[i];if(x>c.x0&&x<c.x1&&z>c.z0&&z<c.z1){const y=c.fn?c.fn(x,z,h):c.y;if(y<h)h=y;}}
  const CL=CUT_GRID.get(Math.floor(x/CG)*10007+Math.floor(z/CG));
  if(CL)for(let i=0;i<CL.length;i++){const c=CL[i];if(x>c.x0&&x<c.x1&&z>c.z0&&z<c.z1){const y=c.fn?c.fn(x,z,h):c.y;if(y<h)h=y;}}
  return h;
}
// keep terrain out of a tube interior: where ground would intrude below ceiling+margin, push it under the floor
const railGrade=z=>-3*sstep(-260,-160,z);

// ---------------- GEOMETRY STORE ----------------
const CELL=40,NCELL=120;const BOPEN=new Map(),BSEQ=new Map();
const BUCK=new Map();
function getB(mat,cx,cz){
  const ix=clamp(Math.floor((cx+2400)/CELL),0,NCELL-1),iz=clamp(Math.floor((cz+2400)/CELL),0,NCELL-1);
  const base=mat*1e6+ix*NCELL+iz;
  let b=BOPEN.get(base);if(b&&b.n>60000)b=null;
  if(!b){const k=BSEQ.get(base)||0;BSEQ.set(base,k+1);const key=base*64+k;b={key,mat,n:0,cap:2048,P:new Float32Array(2048*3),N:new Int8Array(2048*4),C:new Uint8Array(2048*4),I:new Uint32Array(4096),ni:0,min:[1e9,1e9,1e9],max:[-1e9,-1e9,-1e9]};BUCK.set(key,b);BOPEN.set(base,b);}
  return b;
}
function ensure(b,nv,ni){
  if(b.n+nv>b.cap){let c=b.cap;while(b.n+nv>c)c*=2;const P=new Float32Array(c*3);P.set(b.P);b.P=P;const N=new Int8Array(c*4);N.set(b.N);b.N=N;const C=new Uint8Array(c*4);C.set(b.C);b.C=C;b.cap=c;}
  if(b.ni+ni>b.I.length){let c=b.I.length;while(b.ni+ni>c)c*=2;const I=new Uint32Array(c);I.set(b.I);b.I=I;}
}
let STATS={boxes:0,tris:0};
function V(b,p,n,c,e){
  const i=b.n++;b.P[i*3]=p[0];b.P[i*3+1]=p[1];b.P[i*3+2]=p[2];
  b.N[i*4]=Math.round(n[0]*127);b.N[i*4+1]=Math.round(n[1]*127);b.N[i*4+2]=Math.round(n[2]*127);
  b.C[i*4]=clamp(c[0]*255,0,255);b.C[i*4+1]=clamp(c[1]*255,0,255);b.C[i*4+2]=clamp(c[2]*255,0,255);b.C[i*4+3]=e===true?255:(e||0);b.N[i*4+3]=95;
  if(p[0]<b.min[0])b.min[0]=p[0];if(p[1]<b.min[1])b.min[1]=p[1];if(p[2]<b.min[2])b.min[2]=p[2];
  if(p[0]>b.max[0])b.max[0]=p[0];if(p[1]>b.max[1])b.max[1]=p[1];if(p[2]>b.max[2])b.max[2]=p[2];
  return i;
}
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function norm(a){const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];}

// frame
let F={ox:0,oy:0,oz:0,ry:0,c:1,s:0,base:0,tilt:null,mat:0,coll:true};
const FST=[];
function push(lx,ly,lz,ry,extra){const o=toWpre(lx,ly,lz);FST.push(F);const r=F.ry+(ry||0);F=Object.assign({},F,{ox:o[0],oy:o[1],oz:o[2],ry:r,c:Math.cos(r),s:Math.sin(r)},extra||{});}
function pop(){F=FST.pop();}
function toWpre(lx,ly,lz){return [F.ox+lx*F.c-lz*F.s,F.oy+ly,F.oz+lx*F.s+lz*F.c];}
function toW(lx,ly,lz){const p=toWpre(lx,ly,lz);return F.tilt?F.tilt(p[0],p[1],p[2]):p;}

function shade(col,y,j){
  const g=0.70+0.30*sstep(0,9,y-F.base);
  return [col[0]*g*j,col[1]*g*j,col[2]*g*j];
}
const FACES=[[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];let HEXN=0;
let DRY=false,NORNG=false;
function hexa(C,col,o){
  o=o||{};if(DRY){if(!o.flat)R();return;}
  const cx=(C[0][0]+C[6][0])/2,cy=(C[0][1]+C[6][1])/2,cz=(C[0][2]+C[6][2])/2;
  const b=getB(o.mat!=null?o.mat:F.mat,cx,cz);
  ensure(b,24,36);
  const j=(o.flat||NORNG)?1:1+(R()-0.5)*0.12;const am=matOf(col,o);if(o.e)LAMPS.push([cx,cy,cz]);
  let CC=C;{HEXN++;const e=0.0005+0.0005*(HEXN%5),ctr=[cx,cy,cz],ax=[sub(C[1],C[0]),sub(C[3],C[0]),sub(C[4],C[0])].map(v=>{const l=Math.hypot(v[0],v[1],v[2]);return l>1e-6?[v[0]/l,v[1]/l,v[2]/l]:null;});
    CC=C.map(p=>{const dd=sub(p,ctr),q=[p[0],p[1],p[2]];for(const a of ax){if(!a)continue;const sg=Math.sign(dot(dd,a));q[0]+=a[0]*e*sg;q[1]+=a[1]*e*sg;q[2]+=a[2]*e*sg;}return q;});}
  for(let f=0;f<6;f++){
    if(o.skip&&o.skip[f])continue;
    let q=FACES[f];let a=CC[q[0]],bb=CC[q[1]],c=CC[q[2]],d=CC[q[3]];
    let n=cross(sub(bb,a),sub(c,a));
    const fc=[(a[0]+c[0])/2-cx,(a[1]+c[1])/2-cy,(a[2]+c[2])/2-cz];
    if(dot(n,fc)<0){const t=bb;bb=d;d=t;n=[-n[0],-n[1],-n[2]];}
    n=norm(n);
    const i0=V(b,a,n,o.e?col:shade(col,a[1],j),am),i1=V(b,bb,n,o.e?col:shade(col,bb[1],j),am),i2=V(b,c,n,o.e?col:shade(col,c[1],j),am),i3=V(b,d,n,o.e?col:shade(col,d[1],j),am);
    b.I[b.ni++]=i0;b.I[b.ni++]=i1;b.I[b.ni++]=i2;b.I[b.ni++]=i0;b.I[b.ni++]=i2;b.I[b.ni++]=i3;
    STATS.tris+=2;
  }
  STATS.boxes++;
}
// generic triangle/quad with explicit normal toward 'out' reference
function quadW(a,bb,c,d,col,ref,o){if(DRY)return;
  o=o||{};
  const cx=(a[0]+c[0])/2,cz=(a[2]+c[2])/2;const b=getB(o.mat!=null?o.mat:F.mat,cx,cz);ensure(b,4,6);
  let n=cross(sub(bb,a),sub(c,a));
  if(ref){const fc=[(a[0]+c[0])/2-ref[0],(a[1]+c[1])/2-ref[1],(a[2]+c[2])/2-ref[2]];if(dot(n,fc)<0){const t=bb;bb=d;d=t;n=[-n[0],-n[1],-n[2]];}}
  n=norm(n);
  const am=matOf(col,o);const i0=V(b,a,n,o.e?col:shade(col,a[1],1),am),i1=V(b,bb,n,o.e?col:shade(col,bb[1],1),am),i2=V(b,c,n,o.e?col:shade(col,c[1],1),am),i3=V(b,d,n,o.e?col:shade(col,d[1],1),am);
  b.I[b.ni++]=i0;b.I[b.ni++]=i1;b.I[b.ni++]=i2;b.I[b.ni++]=i0;b.I[b.ni++]=i2;b.I[b.ni++]=i3;STATS.tris+=2;
}
function triW(a,bb,c,col,ref,o){if(DRY)return;
  o=o||{};
  const b=getB(o.mat!=null?o.mat:F.mat,a[0],a[2]);ensure(b,3,3);
  let n=cross(sub(bb,a),sub(c,a));
  if(ref){const fc=[(a[0]+bb[0]+c[0])/3-ref[0],(a[1]+bb[1]+c[1])/3-ref[1],(a[2]+bb[2]+c[2])/3-ref[2]];if(dot(n,fc)<0){const t=bb;bb=c;c=t;n=[-n[0],-n[1],-n[2]];}}
  n=norm(n);
  const am=matOf(col,o);const i0=V(b,a,n,shade(col,a[1],1),am),i1=V(b,bb,n,shade(col,bb[1],1),am),i2=V(b,c,n,shade(col,c[1],1),am);
  b.I[b.ni++]=i0;b.I[b.ni++]=i1;b.I[b.ni++]=i2;STATS.tris++;
}

// ---------------- COLLISION ----------------
const HS=8, HASH=new Map();
const hk=(ix,iz)=>(ix+1000)*4096+(iz+1000);
function addSolid(o){if(DRY)return;
  // o: {cx,cz,c,s,hx,hz,y0,y1,ramp?}
  const ex=Math.abs(o.c)*o.hx+Math.abs(o.s)*o.hz, ez=Math.abs(o.s)*o.hx+Math.abs(o.c)*o.hz;
  const x0=Math.floor((o.cx-ex)/HS),x1=Math.floor((o.cx+ex)/HS),z0=Math.floor((o.cz-ez)/HS),z1=Math.floor((o.cz+ez)/HS);
  for(let i=x0;i<=x1;i++)for(let k=z0;k<=z1;k++){const key=hk(i,k);let a=HASH.get(key);if(!a){a=[];HASH.set(key,a);}a.push(o);}
}
function box(lx,ly,lz,w,h,d,col,o){
  o=o||{};
  if(w<=0.001||h<=0.001||d<=0.001)return;
  const x0=lx-w/2,x1=lx+w/2,z0=lz-d/2,z1=lz+d/2,y0=ly,y1=ly+h;
  const C=[toW(x0,y0,z0),toW(x1,y0,z0),toW(x1,y0,z1),toW(x0,y0,z1),toW(x0,y1,z0),toW(x1,y1,z0),toW(x1,y1,z1),toW(x0,y1,z1)];
  hexa(C,col,o);
  if(F.coll&&!o.nc&&!F.tilt&&h>0.04){
    const p=toWpre(lx,ly,lz);
    addSolid({cx:p[0],cz:p[2],c:F.c,s:F.s,hx:w/2,hz:d/2,y0:p[1],y1:p[1]+h});
  }
}
// world-space ramp collision helper
function rampW(x0,z0,y0,x1,z1,y1,wid){
  const dx=x1-x0,dz=z1-z0,L=Math.hypot(dx,dz)||0.01;
  addSolid({cx:(x0+x1)/2,cz:(z0+z1)/2,c:dx/L,s:dz/L,hx:L/2,hz:wid/2,y0:y0,y1:y1,ramp:true});
}
// ramp/stair flight in local frame from (ax,az,ya) to (bx,bz,yb)
const FLIGHTS=[];
function flight(ax,az,ya,bx,bz,yb,wid,col,steps){
  const dx=bx-ax,dz=bz-az,L=Math.hypot(dx,dz),ang=Math.atan2(dz,dx);
  if(!F.tilt){const A=toWpre(ax,ya,az),B=toWpre(bx,yb,bz);FLIGHTS.push([A[0],A[2],A[1],B[0],B[2],B[1],wid,steps?1:0]);}
  push((ax+bx)/2,0,(az+bz)/2,ang);
  const rise=yb-ya;
  if(steps==='m'){
    // single stepped mesh (cheap): build ascending along +x, mirrored if descending
    const up=rise>=0,lo=up?ya:yb,hi=up?yb:ya,sg=up?1:-1,n=Math.max(2,Math.round(Math.abs(rise)/0.19)),run=L/n,r=(hi-lo)/n,t=0.22,w2=wid/2;
    const X=x=>sg*x,U=x=>lo-t+(hi-lo)*(x+L/2)/L,P=(x,y,z)=>toW(X(x),y,z);
    for(let i=0;i<n;i++){
      const x0=-L/2+i*run,x1=x0+run,hTop=lo+(i+1)*r,hPrev=lo+i*r;
      quadW(P(x0,hTop,-w2),P(x1,hTop,-w2),P(x1,hTop,w2),P(x0,hTop,w2),col,P((x0+x1)/2,hTop-1,0));
      quadW(P(x0,hPrev,-w2),P(x0,hTop,-w2),P(x0,hTop,w2),P(x0,hPrev,w2),col,P(x0+run/2,hPrev,0));
      for(const z of [-w2,w2])quadW(P(x0,U(x0),z),P(x1,U(x1),z),P(x1,hTop,z),P(x0,hTop,z),col,P((x0+x1)/2,(hTop+U(x0))/2,0));
    }
    quadW(P(-L/2,U(-L/2),-w2),P(L/2,U(L/2),-w2),P(L/2,U(L/2),w2),P(-L/2,U(-L/2),w2),col,P(0,U(0)+1,0));
    quadW(P(L/2,U(L/2),-w2),P(L/2,hi,-w2),P(L/2,hi,w2),P(L/2,U(L/2),w2),col,P(L/2-0.5,hi-0.2,0));
  }else if(steps){
    const n=Math.max(2,Math.round(Math.abs(rise)/0.18)),run=L/n,r=rise/n;
    for(let i=0;i<n;i++){const top=ya+(i+1)*r;box(-L/2+(i+0.5)*run,top-Math.abs(r)-0.25,0,run+0.01,Math.abs(r)+0.25,wid,col,{nc:true});}
  }else{
    const t=0.25;
    const C=[toW(-L/2,ya-t,-wid/2),toW(L/2,yb-t,-wid/2),toW(L/2,yb-t,wid/2),toW(-L/2,ya-t,wid/2),toW(-L/2,ya,-wid/2),toW(L/2,yb,-wid/2),toW(L/2,yb,wid/2),toW(-L/2,ya,wid/2)];
    hexa(C,col);
  }
  if(F.coll&&!F.tilt){const a=toWpre(-L/2,ya,0),b=toWpre(L/2,yb,0);rampW(a[0],a[2],a[1],b[0],b[2],b[1],wid);}
  pop();
}
// beam between two world points
function beamW(p0,p1,w,h,col,o){
  const d=sub(p1,p0);const L=Math.hypot(d[0],d[1],d[2]);if(L<1e-4)return;
  let up=Math.abs(d[1])/L>0.95?[1,0,0]:[0,1,0];
  const s=norm(cross(d,up)),u=norm(cross(s,d));
  const hw=w/2,hh=h/2;
  const P=(p,a,b)=>[p[0]+s[0]*a+u[0]*b,p[1]+s[1]*a+u[1]*b,p[2]+s[2]*a+u[2]*b];
  const C=[P(p0,-hw,-hh),P(p0,hw,-hh),P(p0,hw,hh),P(p0,-hw,hh),P(p1,-hw,-hh),P(p1,hw,-hh),P(p1,hw,hh),P(p1,-hw,hh)];
  hexa(C,col,o);
}
function beamL(a,b,w,h,col,o){beamW(toW(a[0],a[1],a[2]),toW(b[0],b[1],b[2]),w,h,col,o);}
// cylinder (local)
function cyl(lx,ly,lz,r0,r1,h,seg,col,o){
  o=o||{};
  const ring=(y,r)=>{const a=[];for(let i=0;i<seg;i++){const t=i/seg*PI*2;a.push(toW(lx+Math.cos(t)*r,y,lz+Math.sin(t)*r));}return a;};
  const A=ring(ly,r0),B=ring(ly+h,r1);
  for(let i=0;i<seg;i++){const j=(i+1)%seg;const ref=toW(lx,ly+h/2,lz);quadW(A[i],A[j],B[j],B[i],col,ref,o);}
  if(!o.open){const top=toW(lx,ly+h,lz),ref=toW(lx,ly,lz);for(let i=0;i<seg;i++){const j=(i+1)%seg;triW(top,B[i],B[j],col,ref,o);}}
  if(o.coll&&F.coll){const p=toWpre(lx,ly,lz);addSolid({cx:p[0],cz:p[2],c:F.c,s:F.s,hx:r0*0.85,hz:r0*0.85,y0:p[1],y1:p[1]+h});}
}
// prism from 2D polygon in local x-y plane, thickness along z
function prismXY(pts,cx,cy,cz,th,col,o){
  const n=pts.length;const F0=pts.map(p=>toW(cx+p[0],cy+p[1],cz-th/2)),F1=pts.map(p=>toW(cx+p[0],cy+p[1],cz+th/2));
  const ref=toW(cx,cy,cz);
  const c0=toW(cx,cy,cz-th/2),c1=toW(cx,cy,cz+th/2);
  for(let i=0;i<n;i++){const j=(i+1)%n;triW(c0,F0[i],F0[j],col,toW(cx,cy,cz+1),o);triW(c1,F1[i],F1[j],col,toW(cx,cy,cz-1),o);}
  for(let i=0;i<n;i++){const j=(i+1)%n;quadW(F0[i],F0[j],F1[j],F1[i],col,ref,o);}
}
// ================= ARCHITECTURE HELPERS =================
function solidL(lx,ly,lz,w,h,d){const p=toWpre(lx,ly,lz);addSolid({cx:p[0],cz:p[2],c:F.c,s:F.s,hx:w/2,hz:d/2,y0:p[1],y1:p[1]+h});}
// wall along local x at z, with openings {x,w,sill,top}
function wallRun(x0,x1,z,t,y,h,ops,col,o){
  if(x1-x0<0.02)return;
  if(ops&&ops.length&&!F.tilt&&!(o&&o.noKit))for(const p of ops){const a=Math.max(x0,p.x-p.w/2),b=Math.min(x1,p.x+p.w/2),W=b-a;if(W<0.45)continue;const tp=Math.min(p.top,h),Hh=tp-p.sill;if(Hh<0.45)continue;kitOpening((a+b)/2,y+p.sill,z,W,Hh,t,p.sill<0.05,col);}
  const L=(ops||[]).filter(p=>p.x+p.w/2>x0+0.05&&p.x-p.w/2<x1-0.05).sort((a,b)=>a.x-b.x);
  if(!L.length){box((x0+x1)/2,y,z,x1-x0,h,t,col,Object.assign({},o||{},{skip:[1,0,0,0,0,0]}));return;}
  let lo=1e9,hi=-1e9;for(const p of L){lo=Math.min(lo,p.sill);hi=Math.max(hi,Math.min(p.top,h));}
  const oB=Object.assign({},o||{},{skip:[1,0,0,0,0,0]}),oP=Object.assign({},o||{},{skip:[1,hi<h-0.001?1:0,0,0,0,0]});
  if(lo>0.001)box((x0+x1)/2,y,z,x1-x0,lo,t,col,oB);
  if(hi<h-0.001)box((x0+x1)/2,y+hi,z,x1-x0,h-hi,t,col,o);
  let cx=x0;
  for(const p of L){
    const a=Math.max(x0,p.x-p.w/2),b=Math.min(x1,p.x+p.w/2);
    if(a>cx+0.001)box((cx+a)/2,y+lo,z,a-cx,hi-lo,t,col,oP);
    if(p.sill>lo+0.001)box((a+b)/2,y+lo,z,b-a,p.sill-lo,t,col,o);
    const tp=Math.min(p.top,h);if(tp<hi-0.001)box((a+b)/2,y+tp,z,b-a,hi-tp,t,col,o);
    cx=Math.max(cx,b);
  }
  if(x1>cx+0.001)box((cx+x1)/2,y+lo,z,x1-cx,hi-lo,t,col,oP);
  if(!(o&&o.noLeaf))for(const p of L)if(p.sill===0&&p.w<=1.25&&(NORNG?false:chance(0))){const a=rnd(0.25,1.7)*(chance(0.5)?1:-1);push(p.x-p.w/2+0.03,y,z,a);box((p.w-0.06)/2,0.02,0,p.w-0.06,Math.min(2.05,p.top-0.05),0.05,pick([COL.wood,COL.wood,COL.steel,COL.teal]),{nc:true});pop();}
}
// wall along local z at x (openings x = position along z)
const KW=[],KD=[],DOORZ=new Map();
function doorBlocks(x,y,z,r){const ci=Math.floor(x/8),ck=Math.floor(z/8);for(let i=ci-1;i<=ci+1;i++)for(let k=ck-1;k<=ck+1;k++){const L=DOORZ.get(i*10007+k);if(!L)continue;for(const d of L){if(Math.abs(d[1]-y)>1.5)continue;if(Math.hypot(d[0]-x,d[2]-z)<r+d[3]+0.55)return true;}}return false;}
const KCOL_STEEL=[[0.48,0.17,0.13],[0.22,0.32,0.24],[0.2,0.27,0.36],[0.36,0.25,0.16],[0.42,0.40,0.36]];
let KS=987654;const KR=()=>(KS=(KS*16807)%2147483647)/2147483647;
function kitOpening(cx,y0,z,W,Hh,t,door,col){
  if(DRY)return;
  const o=toW(cx,y0,z),yaw=F.ry;
  if(!door){
    const ind=col===COL.brick||col===COL.steel||col===COL.rust||col===COL.conD;
    const dm=typeof dmgAt==='function'?dmgAt(o[0],o[2]):0.3;let mask=0;for(let i=0;i<4;i++)if(KR()<0.25+dm*0.5)mask|=1<<i;
    const fc=ind?[0.30,0.31,0.31,7]:KR()<0.6?[0.74,0.72,0.66,10]:[0.46,0.35,0.24,10];
    KW.push([o[0],o[1],o[2],yaw,W,Hh,t,mask,1,1,1,fc[0],fc[1],fc[2],fc[3]]);return;}
  if(W>2.7||Hh>3.3)return;
  {const key=Math.floor(o[0]/8)*10007+Math.floor(o[2]/8);let L=DOORZ.get(key);if(!L){L=[];DOORZ.set(key,L);}const c2=Math.cos(yaw),s2=Math.sin(yaw);L.push([o[0]+c2*W/2,o[1],o[2]+s2*W/2,W/2]);}
  const kind=(col===COL.teal||col===COL.green||col===COL.blue)?'apt':col===COL.white?'wood':'steel';
  const fc=kind==='apt'?[0.30,0.19,0.13,13]:kind==='wood'?[0.60,0.53,0.40,10]:(c=>[c[0],c[1],c[2],12])(KCOL_STEEL[Math.floor(KR()*KCOL_STEEL.length)]);
  const st=()=>{const r=KR();return r<0.36?0:r<0.72?(0.3+KR()*0.9):r<0.88?1.62:null;};
  const sg=KR()<0.5?1:-1;
  if(W<=1.55){const s0=st(),h=toW(cx-W/2,y0,z);KD.push([h[0],h[1],h[2],yaw,W,Hh,t,s0===null?2:0,1,1,W,fc[0],fc[1],fc[2],fc[3],(s0||0)*sg]);}
  else{const h1=toW(cx-W/2,y0,z),h2=toW(cx+W/2,y0,z),a=st(),b=st();
    KD.push([h1[0],h1[1],h1[2],yaw,W/2,Hh,t,a===null?2:0,1,1,W,fc[0],fc[1],fc[2],fc[3],(a||0)*sg]);
    KD.push([h2[0],h2[1],h2[2],yaw+Math.PI,W/2,Hh,t,(b===null?2:0)|1,1,1,0,fc[0],fc[1],fc[2],fc[3],(b||0)*sg]);}
}
function wallRunZ(z0,z1,x,t,y,h,ops,col,o){push(0,0,0,HP);wallRun(z0,z1,-x,t,y,h,ops,col,o);pop();}
// slab with rectangular holes; top surface at y
function slabR(x0,x1,z0,z1,y,th,holes,col,o){
  if(!o&&(col===COL.conL||col===COL.conD||col===COL.white))o={m:MAT.floor};
  holes=(holes||[]).map(h=>({x0:Math.max(x0,h.x0),x1:Math.min(x1,h.x1),z0:Math.max(z0,h.z0),z1:Math.min(z1,h.z1)})).filter(h=>h.x1>h.x0+0.01&&h.z1>h.z0+0.01);
  if(!holes.length){box((x0+x1)/2,y-th,(z0+z1)/2,x1-x0,th,z1-z0,col,o);return;}
  const xs=[x0,x1],zs=[z0,z1];for(const h of holes){xs.push(h.x0,h.x1);zs.push(h.z0,h.z1);}
  const ux=[...new Set(xs.map(v=>Math.round(v*100)/100))].sort((a,b)=>a-b),uz=[...new Set(zs.map(v=>Math.round(v*100)/100))].sort((a,b)=>a-b);
  const inH=(x,z)=>holes.some(h=>x>h.x0&&x<h.x1&&z>h.z0&&z<h.z1);
  for(let k=0;k<uz.length-1;k++){
    const za=uz[k],zb=uz[k+1],zm=(za+zb)/2;let run=null;
    for(let i=0;i<ux.length-1;i++){
      const xa=ux[i],xb=ux[i+1],xm=(xa+xb)/2;
      if(!inH(xm,zm)){if(run===null)run=xa;}
      else if(run!==null){box((run+xa)/2,y-th,zm,xa-run,th,zb-za,col,o);run=null;}
    }
    if(run!==null){const xe=ux[ux.length-1];box((run+xe)/2,y-th,zm,xe-run,th,zb-za,col,o);}
  }
}
// balcony railings: steel side guards (post, top + bottom rail, balusters) and a handrail on the front panel
let BALC=0;
function balconyRail(bx,y,zw,dep,wid,col){const sv=NORNG;NORNG=true;BALC++;try{
  const z0=zw,z1=zw+dep,zc=(z0+z1)/2,hw=wid/2,c=col||COL.rust;
  box(bx,y+1.0,z1-0.04,wid+0.06,0.05,0.09,c,{nc:true});
  for(const s of [-1,1]){const x=bx+s*(hw-0.02);
    box(x,y+0.95,zc,0.05,0.06,dep,c);box(x,y+0.08,zc,0.04,0.04,dep,c,{nc:true});box(x,y,z1-0.06,0.06,1.0,0.06,c);
    for(let i=1;i<=5;i++){const zz=z0+dep*i/6.2;box(x,y+0.1,zz,0.022,0.86,0.022,COL.steel,{nc:true,mat:6});}}
  const w=toW(bx,y,zw),hs=((Math.sin(w[0]*12.9898+w[2]*78.233+w[1]*3.7)*43758.5453)%1+1)%1,D6={nc:true,mat:6};
  if(hs<0.2){ // glazed-in balcony: timber frames and glass above the front panel and down the sides
    const FR=[0.42,0.33,0.24];for(let i=0;i<=4;i++)box(bx-hw+wid*i/4,y+1.02,z1-0.05,0.06,1.55,0.06,FR,D6);box(bx,y+1.02,z1-0.05,wid,0.06,0.07,FR,D6);box(bx,y+2.52,z1-0.05,wid,0.08,0.08,FR,D6);
    box(bx,y+1.05,z1-0.05,wid-0.04,1.45,0.02,COL.glass,{});for(const s of [-1,1]){box(bx+s*(hw-0.02),y+1.05,zc,0.02,1.45,dep-0.1,COL.glass,{});box(bx+s*(hw-0.02),y+2.52,zc,0.07,0.08,dep,FR,D6);}}
  else if(hs<0.36){ // laundry lines strung across the balcony
    const CL=[[0.62,0.6,0.55],[0.45,0.22,0.2],[0.3,0.36,0.46],[0.7,0.68,0.6],[0.52,0.48,0.32]];
    for(let l=0;l<2;l++){const zz=z0+0.35+l*0.45;box(bx,y+2.0,zz,wid-0.1,0.012,0.012,COL.dark,D6);
      for(let k=0;k<4;k++){const r2=((hs*97+l*13+k*7.3)%1),cw=0.3+r2*0.35,ch=0.35+((r2*31)%1)*0.45,cx=bx-hw+0.3+k*(wid-0.6)/3;box(cx,y+2.0-ch,zz,cw,ch,0.012,CL[Math.floor(r2*5)],{nc:true,mat:6,m:MAT.fabric});}}}
  else if(hs>0.5&&hs<0.62){ // overgrown: a self-seeded bush and a cracked pot
    TREES.push({x:w[0],y:w[1]+0.02,z:w[2]+0,type:2,s:0.1+(hs-0.5)*0.6});box(bx+hw-0.35,y,z0+0.3,0.3,0.28,0.3,[0.45,0.27,0.18],{nc:true,mat:6});}
  else if(hs<0.5){ // stored clutter: crates, an old cabinet, a sledge
    box(bx-hw+0.45,y,z0+0.35,0.6,0.45,0.45,[0.4,0.32,0.22],{mat:6,m:MAT.wood});box(bx+hw-0.4,y,z0+0.3,0.5,1.1,0.4,[0.46,0.4,0.31],{mat:6,m:MAT.wood});
    if(hs>0.44)box(bx,y+0.02,z0+0.85,0.9,0.12,0.32,[0.5,0.18,0.14],{nc:true,mat:6});}
}finally{NORNG=sv;}}
function railL(ax,az,bx,bz,y,col,h){
  h=h||1.0;col=col||COL.rust;
  const L=Math.hypot(bx-ax,bz-az),ang=Math.atan2(bz-az,bx-ax);
  push((ax+bx)/2,0,(az+bz)/2,ang);
  box(0,y+h-0.05,0,L,0.05,0.06,col,{nc:true});box(0,y+h*0.5,0,L,0.04,0.04,col,{nc:true});
  const n=Math.max(1,Math.round(L/2.5));for(let i=0;i<=n;i++)box(-L/2+L*i/n,y,0,0.05,h,0.05,col,{nc:true,skip:[1,1,0,0,0,0]});
  solidL(0,y,0,L,h,0.12);
  pop();
}
// stair storey: core spans from zl to zl - s*6 (landing at zl side), centered at xc, width 3
function stairs(xc,zl,s,y,fh,det,col){
  col=col||COL.conL;
  const z1=zl-s*1.2,z2=zl-s*4.8,z3=zl-s*6;
  box(xc,y+fh/2-0.25,(z2+z3)/2,3,0.25,1.2,col);
  flight(xc-0.75,z1,y,xc-0.75,z2,y+fh/2,1.51,col,det>=3?true:'m');
  flight(xc+0.75,z2,y+fh/2,xc+0.75,z1,y+fh,1.51,col,det>=3?true:'m');
  beamL([xc,y+1.0,z1],[xc,y+fh/2+1.0,z2],0.05,0.05,COL.rust,{nc:true});
  solidL(xc,y+0.1,(z1+z2)/2,0.1,fh,Math.abs(z2-z1));
  stairBalustrade(xc,z1,z2,y,fh);
}
// stairwell balustrade on the line between the two flights: steel balusters, timber handrail on the upper flight, base stringer
let BALU=0;
function stairBalustrade(xc,z1,z2,y,fh){const sv=NORNG;NORNG=true;BALU++;try{const HR=[0.36,0.23,0.13];
  beamL([xc+0.04,y+fh/2+0.95,z2],[xc+0.04,y+fh+0.95,z1],0.06,0.05,HR,{nc:true});
  for(let i=1;i<8;i++){const t=i/8,z=z1+(z2-z1)*t,yl=y+(fh/2)*t,yu=y+fh/2+(fh/2)*(1-t)+0.95;box(xc,yl,z,0.025,yu-yl,0.025,COL.steel,{nc:true,mat:6});}
  box(xc,y,z1,0.06,fh+1.0,0.06,COL.steel,{nc:true});box(xc,y+fh/2,z2,0.06,1.0,0.06,COL.steel,{nc:true});
  beamL([xc,y+0.06,z1],[xc,y+fh/2+0.06,z2],0.08,0.14,COL.conD,{nc:true,mat:6});
  {const PC=[0.26,0.34,0.27],sz=Math.sign(z2-z1)||1;for(const [dx,r] of [[1.38,0.05],[1.27,0.035]])box(xc+dx,y,z1-sz*0.25,r*2,fh,r*2,PC,{nc:true,mat:6});beamL([xc-1.45,y+fh-0.32,z2+sz*0.35],[xc+1.45,y+fh-0.32,z2+sz*0.35],0.08,0.08,COL.rust,{nc:true,mat:6});}
}finally{NORNG=sv;}}
const stairHole=(xc,zl,s)=>{const a=zl-s*1.2,b=zl-s*6;return {x0:xc-1.5,x1:xc+1.5,z0:Math.min(a,b),z1:Math.max(a,b)};};
const SEG={0:'abcdef',1:'bc',2:'abged',3:'abgcd',4:'fgbc',5:'afgcd',6:'afgedc',7:'abc',8:'abcdefg',9:'abcdfg'};
function digits(str,lx,ly,lz,hg,col){
  const w=hg*0.55,t=hg*0.13,gap=hg*0.28,n=str.length,tot=n*w+(n-1)*gap;let x=lx-tot/2;
  for(const ch of str){
    const s=SEG[ch]||'';const z=lz+0.07,d=0.12;
    if(s.includes('a'))box(x+w/2,ly+hg-t,z,w,t,d,col,{nc:true});
    if(s.includes('g'))box(x+w/2,ly+hg/2-t/2,z,w,t,d,col,{nc:true});
    if(s.includes('d'))box(x+w/2,ly,z,w,t,d,col,{nc:true});
    if(s.includes('f'))box(x+t/2,ly+hg/2,z,t,hg/2,d,col,{nc:true});
    if(s.includes('b'))box(x+w-t/2,ly+hg/2,z,t,hg/2,d,col,{nc:true});
    if(s.includes('e'))box(x+t/2,ly,z,t,hg/2,d,col,{nc:true});
    if(s.includes('c'))box(x+w-t/2,ly,z,t,hg/2,d,col,{nc:true});
    x+=w+gap;
  }
}
const ENTR=[];
function entrance(lx,lz,dx,dz,w){const f=Object.assign({},F);ENTR.push(()=>{const sv=F;F=f;entranceNow(lx,lz,dx,dz,w);F=sv;});}
function entranceNow(lx,lz,dx,dz,w){
  box(lx+dx*0.9,-0.3,lz+dz*0.9,dx?1.8:w+0.4,0.3,dz?1.8:w+0.4,COL.conL);
  let run=0.8,gy=0;
  for(let k=0;k<3;k++){const e=toWpre(lx+dx*(1.8+run),0,lz+dz*(1.8+run));gy=H(e[0],e[2])-F.oy;run=Math.max(0.8,-gy*1.6);}
  if(-gy<0.25)return;
  flight(lx+dx*1.8,lz+dz*1.8,0,lx+dx*(1.8+run),lz+dz*(1.8+run),gy+0.02,w,COL.conL,'m');
}
function roofLadder(lx,lz,top){for(const dx of [-0.25,0.25])box(lx+dx,0,lz,0.06,top+1,0.06,COL.steel,{nc:true});for(let y=0.3;y<top;y+=0.35)box(lx,y,lz,0.5,0.04,0.04,COL.steel,{nc:true});const w=toWpre(lx,0,lz);LADDERS.push({x:w[0],z:w[2],y0:w[1],y1:w[1]+top});}
function climbSolid(w,h,d,y0){y0=y0||0;let k=0;for(let y=0;y<h-0.01;y+=0.42,k++){const f=Math.max(0.35,1-k*0.22),t=Math.min(h,y+0.42);solidL(0,y0,0,w*f,t,d*f);}}
function chunk(w,h,d,col,o){box(0,0,0,w,h,d,col,Object.assign({nc:true},o||{}));climbSolid(w,h,d);}
function rubble(lx,ly,lz,r,n,col){for(let i=0;i<n;i++){const a=rnd(0,PI*2),d=rnd(0,r);push(lx+Math.cos(a)*d,ly,lz+Math.sin(a)*d,rnd(0,PI));const w=rnd(0.5,2.2),h=rnd(0.2,0.9),dd=rnd(0.4,1.6);box(0,0,0,w,h,dd,col||COL.con,{nc:true});climbSolid(w,h,dd);pop();}}
function antenna(lx,ly,lz){const h=rnd(3,7);beamL([lx,ly,lz],[lx,ly+h,lz],0.08,0.08,COL.steel,{nc:true});for(let i=1;i<=3;i++){const y=ly+h*i/4;beamL([lx-0.8,y,lz],[lx+0.8,y,lz],0.04,0.04,COL.steel,{nc:true});}}
function roofTree(lx,ly,lz){const w=toW(lx,ly,lz);TREES.push({x:w[0],y:w[1],z:w[2],type:2,s:rnd(0.45,0.8)});}

// ---- footprint registry ----
const FOOT=[];
function footAABB(x,z,w,d,ry){const c=Math.abs(Math.cos(ry)),s=Math.abs(Math.sin(ry));const ex=(c*w+s*d)/2,ez=(s*w+c*d)/2;return {x0:x-ex,x1:x+ex,z0:z-ez,z1:z+ez,ocx:x,ocz:z,oc:Math.cos(ry),os:Math.sin(ry),ohx:w/2,ohz:d/2};}
function reserve(a,tag){a.tag=tag||'b';FOOT.push(a);return a;}
function overlaps(a,m){for(const f of FOOT){if(a.x0-m<f.x1&&a.x1+m>f.x0&&a.z0-m<f.z1&&a.z1+m>f.z0)return true;}return false;}
function groundBase(x,z,w,d,ry){const c=Math.cos(ry),s=Math.sin(ry);let mx=-1e9,mn=1e9;for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1],[0,0]]){const lx=a*w/2,lz=b*d/2;const h=H(x+lx*c-lz*s,z+lx*s+lz*c);mx=Math.max(mx,h);mn=Math.min(mn,h);}return {top:mx,bot:mn};}


// ================= FURNITURE / DRESSING =================
const FAB=[[0.55,0.30,0.24],[0.36,0.42,0.50],[0.50,0.46,0.32],[0.40,0.46,0.36]];
function furn(kind,x,z,y,ry){
  const fw=toWpre(x,y,z),FR={bed:1.05,wardrobe:0.65,fridge:0.4,shelf:0.6,counter:0.45,counterL:1.0,stove:0.35,tv:0.4,table:0.55,boxes:0.5}[kind]||0.45;
  if(doorBlocks(fw[0],fw[1],fw[2],FR))DRY=true;
  try{furnBody(kind,x,z,y,ry);}finally{DRY=false;}
}
function furnBody(kind,x,z,y,ry){
  push(x,y,z,ry||0);
  switch(kind){
    case 'bed':box(0,0,0,2.0,0.42,0.9,COL.wood);box(0.05,0.42,0,1.85,0.14,0.84,pick(FAB),{nc:true});box(-0.97,0.42,0,0.08,0.55,0.9,COL.wood,{nc:true});break;
    case 'hbed':box(0,0,0,2.0,0.6,0.9,COL.white);box(-0.98,0.6,0,0.06,0.7,0.9,COL.steel,{nc:true});box(0.1,0.6,0,1.7,0.1,0.85,[0.75,0.76,0.72],{nc:true});break;
    case 'wardrobe':box(0,0,0,1.2,2.0,0.56,COL.wood);box(0,0.2,0.285,0.02,1.6,0.01,COL.dark,{nc:true});break;
    case 'sofa':{const c=pick(FAB);box(0,0,0,2.0,0.44,0.86,c);box(0,0.44,-0.36,2.0,0.44,0.16,c,{nc:true});box(-0.94,0.44,0,0.14,0.22,0.86,c,{nc:true});box(0.94,0.44,0,0.14,0.22,0.86,c,{nc:true});break;}
    case 'table':box(0,0.72,0,1.2,0.05,0.8,COL.wood,{nc:true});for(const a of [-0.52,0.52])for(const b of [-0.32,0.32])box(a,0,b,0.06,0.72,0.06,COL.wood,{nc:true});solidL(0,0,0,1.2,0.77,0.8);break;
    case 'chair':box(0,0.42,0,0.42,0.05,0.42,COL.wood,{nc:true});box(0,0.47,-0.19,0.42,0.48,0.04,COL.wood,{nc:true});box(0,0,0,0.05,0.42,0.05,COL.wood,{nc:true});break;
    case 'stove':box(0,0,0,0.6,0.86,0.6,COL.white);box(0,0.86,0,0.55,0.02,0.55,COL.dark,{nc:true});break;
    case 'counter':box(0,0,0,1.8,0.86,0.6,pick([COL.white,COL.green,COL.wood]));box(0,1.5,-0.12,1.8,0.7,0.35,COL.white,{nc:true});break;
    case 'sink':box(0,0,0,0.6,0.86,0.55,COL.white);break;
    case 'fridge':box(0,0,0,0.6,1.5,0.6,COL.white);break;
    case 'rad':box(0,0.15,0,1.0,0.55,0.1,COL.white,{nc:true});break;
    case 'tub':box(0,0,0,1.6,0.56,0.72,COL.white);box(0,0.4,0,1.4,0.17,0.52,COL.conL,{nc:true});break;
    case 'desk':box(0,0,0,1.4,0.75,0.7,COL.wood);break;
    case 'cabinet':box(0,0,0,0.8,1.7,0.46,COL.steel);break;
    case 'shelf':box(0,0,0,2.0,2.1,0.4,COL.wood);for(let k=0;k<4;k++)box(0,0.3+k*0.45,0.21,1.9,0.2,0.02,pick([COL.red,COL.ochre,COL.blue,COL.white,COL.green]),{nc:true});break;
    case 'tv':box(0,0,0,0.8,0.6,0.45,COL.wood);box(0,0.6,0,0.6,0.48,0.45,COL.dark,{nc:true});break;
    case 'piano':box(0,0,0,1.5,1.25,0.6,COL.dark);break;
    case 'boxes':for(let k=0;k<3;k++)box(rnd(-0.4,0.4),k*0.4,rnd(-0.3,0.3),0.6,0.4,0.45,[0.55,0.45,0.3],{nc:k>0});break;
    case 'counterL':box(0,0,0,4,1.0,0.8,COL.wood);box(0,1.0,0,4,0.04,0.9,COL.conL,{nc:true});break;
  }
  pop();
}
function trash(x0,x1,z0,z1,y,n){for(let i=0;i<n;i++)box(rnd(x0,x1),y+0.005,rnd(z0,z1),rnd(0.2,0.6),0.015,rnd(0.2,0.5),pick([COL.white,[0.6,0.55,0.45],COL.ochre]),{nc:true,skip:[1,0,0,0,0,0]});}
// flat in a residential section: front room x0..x1 between spz..zfI, back rooms split at m
function furnishFlat(x0,x1,spz,zfI,zbI,m,y){
  const loot=chance(0.3),k=()=>!loot||chance(0.45);
  const cx=(x0+x1)/2;
  if(k())furn('sofa',cx,spz+0.6,y,0);
  if(k()){furn('table',cx,zfI-1.9,y,0);furn('chair',cx-0.5,zfI-1.2,y,PI+rnd(-0.4,0.4));if(chance(0.7))furn('chair',cx+0.5,zfI-2.6,y,rnd(-0.4,0.4));}
  if(k())furn('wardrobe',x0+0.4,(spz+zfI)/2,y,HP);
  if(k()&&x1-x0>7)furn('tv',x1-0.45,(spz+zfI)/2,y,-HP);
  furn('rad',cx,zfI-0.18,y,0);
  if(k())furn('bed',(x0+m)/2,zbI+1.15,y,0);
  if(k())furn('wardrobe',x0+0.4,spz-1,y,HP);
  furn('rad',(x0+m)/2,zbI+0.18,y,0);
  if(k())furn('counter',x1-0.4,(zbI+spz)/2,y,-HP);
  if(k()){furn('stove',x1-0.4,(zbI+spz)/2-1.3,y,-HP);furn('fridge',x1-0.4,spz-0.6,y,-HP);}
  if(k()){furn('table',(m+x1)/2-0.3,(zbI+spz)/2,y,0);furn('chair',(m+x1)/2-0.9,(zbI+spz)/2,y,HP);}
  if(chance(0.6))trash(x0+0.5,x1-0.5,zbI+0.5,zfI-0.5,y,loot?7:3);
}

const SLABS=[],TOWERS=[],HALLS=[],LIFTS=[];
// ================= RESIDENTIAL SLAB =================
function resSlab(p){
  const L=p.len,D=p.depth||12,n=p.floors,zf=D/2,FH=3,det=Math.max(1,p.detail||0),dmg=p.damage||0;
  const nb=Math.round(L/3);
  const nSec=Math.max(1,Math.round(L/(p.sec||(n>=9?24:15)))),sl=L/nSec;
  const cores=[];for(let i=0;i<nSec;i++){const c=-L/2+sl*(i+0.5);cores.push(-L/2+1.5+3*Math.round((c+L/2-1.5)/3));}
  const gb=groundBase(p.x,p.z,L,D+4,p.ry);if(p.baseY!=null){gb.bot=Math.min(gb.bot,p.baseY);gb.top=p.baseY;}
  reserve(footAABB(p.x,p.z,L,D+(p.gallery?4:2),p.ry),'res');addBPad(footAABB(p.x,p.z,L+3,D+(p.gallery?5:3),p.ry),gb.top-0.05,9);
  push(p.x,gb.top,p.z,p.ry,{base:gb.top});
  const wallC=p.wall||COL.panel,pc=p.paint||COL.teal,zl=zf-0.3;
  const LIFT=CMPT&&n>=9&&!p.gallery,lsg=c=>(c+4.6<=L/2-0.3)?1:-1,lx0=c=>c+lsg(c)*1.65,lx1=c=>c+lsg(c)*4.35;
  SLABS.push({x:p.x,z:p.z,ry:p.ry,base:gb.top,c:cores[0],zl,zf,n,L,lift:LIFT});
  if(LIFT)for(const c of cores)LIFTS.push({bx:p.x,bz:p.z,bry:p.ry,lx:c+lsg(c)*3,lz:zl-1.5,yl:Math.PI/2,cx0:-2.55,cx1:-0.2,w:2.1,dw:1.0,stops:[...Array(n).keys()].map(f=>gb.top+f*FH),name:'slab'});
  box(0,gb.bot-gb.top-2,0,L,gb.top-gb.bot+2-0.4,D,COL.conD);
  const bal=[];for(let f=0;f<n;f++){bal.push([]);for(let b=0;b<nb;b++)bal[f].push(!p.gallery&&f>=1&&chance(p.balc!=null?p.balc:0.3));}
  const isCore=bx=>cores.some(c=>Math.abs(c-bx)<1.4);
  for(let f=0;f<n;f++){
    const y=f*FH,full=det>=2||(det===1&&f===0);
    const holes=[];
    if(f>=1&&det>=1)for(const c of cores)holes.push(stairHole(c,zl,1));
    if(f>=1&&LIFT)for(const c of cores)holes.push({x0:Math.min(lx0(c),lx1(c)),x1:Math.max(lx0(c),lx1(c)),z0:zl-4.3,z1:zl-1.5});
    if(f>=1&&chance(dmg*0.5)){const bx=-L/2+1.5+3*Math.floor(rnd(0,nb));if(!isCore(bx)&&!isCore(bx+3))holes.push({x0:bx-1.5,x1:bx+1.5,z0:-zf+0.4,z1:-zf+3.4});}
    slabR(-L/2,L/2,-zf,zf,y,f===0?0.4:0.25,holes,COL.conL);
    // front
    const fo=[],bo=[];
    for(let b=0;b<nb;b++){
      const bx=-L/2+1.5+3*b;
      if(f===0&&cores.some(c=>Math.abs(c-bx)<0.1))fo.push({x:bx,w:1.4,sill:0,top:2.3});
      else if(f===0&&p.shop&&!isCore(bx))bo.length,fo.push({x:bx,w:2.5,sill:0.45,top:2.6});
      else if(p.gallery&&f>=1&&b%2===0)fo.push({x:bx,w:1.0,sill:0,top:2.2});
      else if(bal[f][b])fo.push({x:bx,w:0.9,sill:0,top:2.2});
      else if(chance(dmg*0.1))fo.push({x:bx,w:2.7,sill:0.1,top:2.8});
      else fo.push({x:bx,w:1.5,sill:0.9,top:2.3});
      if(chance(dmg*0.08))bo.push({x:bx,w:2.7,sill:0.1,top:2.8});else bo.push({x:bx,w:1.5,sill:0.9,top:2.3});
    }
    wallRun(-L/2+0.3,L/2-0.3,zf-0.15,0.3,y,FH,fo,wallC);
    wallRun(-L/2+0.3,L/2-0.3,-zf+0.15,0.3,y,FH,bo,wallC);
    const go=n<9?[{x:-D/4,w:1.2,sill:0.9,top:2.3},{x:D/4,w:1.2,sill:0.9,top:2.3}]:[];
    wallRunZ(-zf,zf,-L/2+0.15,0.3,y,FH,go,wallC);wallRunZ(-zf,zf,L/2-0.15,0.3,y,FH,go,wallC);
    // core walls + stairs
    if(det>=1){
      for(const c of cores){
        for(const sx of [-1,1])wallRunZ(zl-6,zl,c+sx*1.575,0.15,y,FH,[{x:zl-0.6,w:0.9,sill:0,top:2.1}],pc);
        stairs(c,zl,1,y,FH,det,COL.conL);
        if(LIFT){const g=lsg(c),xa=Math.min(c+g*1.575,c+g*4.425),xb=Math.max(c+g*1.575,c+g*4.425);
          wallRunZ(zl-4.3,zl,c+g*4.425,0.15,y,FH,[{x:zl-0.7,w:0.9,sill:0,top:2.1}],pc);
          wallRun(xa,xb,zl-4.3+0.075,0.15,y,FH,[],COL.conD);
          wallRun(xa,xb,zl-1.5,0.15,y,FH,[{x:c+g*3,w:1.1,sill:0,top:2.15}],COL.conD);
          if(f===n-1)box(c+g*3,y+FH+0.3,zl-2.9,3.0,2.6,3.2,COL.con);}
      }
    }
    if(full&&p.shop&&f===0){
      for(let i=1;i<nSec;i++){const xb=-L/2+3*Math.round(sl*i/3);wallRunZ(-zf+0.3,zf-0.3,xb,0.15,y,FH,[],COL.white);}
      for(let i=0;i<nSec;i++){const s0=-L/2+sl*i,c=cores[i];wallRun(s0+0.3,s0+sl-0.3,zl-6-0.075,0.15,y,FH,[{x:c,w:3,sill:0,top:2.4}],COL.white);}
    }else if(full){
      const spz=zl-6-0.075;
      for(let i=0;i<nSec;i++){const s0=-L/2+sl*i,s1=s0+sl,c=cores[i];
        if(false)furnishFlat(s0+0.3,c-1.6,spz,zf-0.3,-zf+0.3,(s0+c-1.5)/2,y);
        push(c+1.5+(s1-c-1.5)/2,0,0,0);push(0,0,0,0);
        pop();pop();
        if(false)furnishFlat(c+1.6,s1-0.3,spz,zf-0.3,-zf+0.3,(c+1.5+s1)/2,y);}
      // party walls between sections
      for(let i=1;i<nSec;i++){const xb=-L/2+3*Math.round(sl*i/3);wallRunZ(-zf+0.3,zf-0.3,xb,0.15,y,FH,[],COL.white);}
      // spine with doors
      const sops=[];
      for(let i=0;i<nSec;i++){const s0=-L/2+sl*i,s1=s0+sl,c=cores[i];sops.push({x:(s0+c-1.5)/2,w:0.9,sill:0,top:2.1},{x:(c+1.5+s1)/2,w:0.9,sill:0,top:2.1});
        // transverse walls in back half
        for(const m of [(s0+c-1.5)/2,(c+1.5+s1)/2])wallRunZ(-zf+0.3,spz,m-1.25,0.12,y,FH,[{x:(-zf+spz)/2,w:0.9,sill:0,top:2.1}],COL.white);
      }
      wallRun(-L/2+0.3,L/2-0.3,spz,0.15,y,FH,sops,COL.white);
      if(f>=1&&chance(0.5)){const c=pick(cores),fx=c+rnd(-6,6),fz=rnd(-zf+1,zf-2),fw=rnd(0.8,1.6),fd=rnd(0.6,1.8);
        const inLift=LIFT&&cores.some(cc=>{const a0=Math.min(cc+lsg(cc)*1.4,cc+lsg(cc)*4.6),a1=Math.max(cc+lsg(cc)*1.4,cc+lsg(cc)*4.6);return fx+fw/2>a0&&fx-fw/2<a1&&fz+fd/2>zl-4.6;});
        if(!inLift)box(fx,y,fz,fw,0.9,fd,COL.wood);}
    }else if(det===0||(det===1&&f>0)){
      const sp2=[];for(let i=0;i<nSec;i++){const s0=-L/2+sl*i,s1=s0+sl,c=cores[i];sp2.push({x:(s0+c-1.5)/2,w:1.0,sill:0,top:2.1},{x:(c+1.5+s1)/2,w:1.0,sill:0,top:2.1});}
      wallRun(-L/2+0.3,L/2-0.3,zf-6.375,0.15,y,FH,sp2,COL.conD);
    }
    // balconies
    if(f>=1)for(let b=0;b<nb;b++)if(bal[f][b]){const bx=-L/2+1.5+3*b;box(bx,y-0.2,zf+0.6,2.6,0.2,1.2,COL.conL);
      box(bx,y,zf+1.15,2.6,1.0,0.08,chance(0.5)?pc:COL.conL);balconyRail(bx,y,zf,1.2,2.6);}
    if(f===0)for(const c of cores){box(c,2.55,zf+0.9,3.2,0.25,2.2,COL.conL,{nc:true});for(const s of [-1,1])box(c+s*1.45,0,zf+1.85,0.25,2.55,0.25,COL.con);box(c-1.55,0,zf+0.9,0.15,2.55,1.8,COL.conL,{nc:true});entrance(c,zf,0,1,2.4);}
    if(p.gallery&&f>=1){box(0,y-0.25,zf+1.0,L,0.25,2.0,COL.conL);railL(-L/2,zf+1.95,L/2,zf+1.95,y,COL.rust,1.1);}
  }
  if(p.shop)for(let i=0;i<nSec;i++){const s0=-L/2+sl*i;box(s0+sl/2,2.7,zf+0.08,sl-4,0.55,0.12,pick([COL.red,COL.blue,COL.ochre]),{nc:true});}
  for(const sx of [-1,1])for(const sz of [-1,1])box(sx*(L/2-0.6),0,sz*(zf+0.1),0.16,n*FH,0.16,COL.rust,{nc:true,skip:[1,0,0,0,0,0]});
  // roof
  const yr=n*FH;
  slabR(-L/2,L/2,-zf,zf,yr,0.3,det>=1?cores.map(c=>stairHole(c,zl,1)):[],COL.conD);
  for(const [a,b,c,d] of [[0,zf-0.12,L,0.25],[0,-zf+0.12,L,0.25]])box(a,yr,b,c,0.9,d,COL.con);
  box(-L/2+0.12,yr,0,0.25,0.9,D,COL.con);box(L/2-0.12,yr,0,0.25,0.9,D,COL.con);
  for(const c of cores){
    if(det>=1){
      wallRunZ(zl-6,zl,c-1.575,0.15,yr,3,[],COL.con);wallRunZ(zl-6,zl,c+1.575,0.15,yr,3,[{x:zl-0.6,w:0.9,sill:0,top:2.1}],COL.con);
      wallRun(c-1.65,c+1.65,zl-6,0.15,yr,3,[],COL.con);box(c,yr+3,zl-3,3.4,0.25,6.2,COL.conD);
    }else box(c,yr,zl-3,3.2,2.8,6,COL.con);
    if(n>=9)box(c,yr,zl-8.5,3.4,2.6,3.6,COL.con);
  }
  for(let i=0;i<Math.round(L/12);i++){const vx=rnd(-L/2+2,L/2-2),vz=rnd(-zf+1,zf-2);if(!isCore(vx))box(vx,yr,vz,0.8,1.2,0.8,COL.conD);}
  if(chance(0.6))antenna(rnd(-L/2+3,L/2-3),yr,rnd(-zf+1,-1));roofKit(-L/2+2,L/2-2,-zf+1,zf-7,yr);
  if(chance(0.25+dmg)){const tx=rnd(-L/2+3,L/2-3),tz=rnd(-zf+1,zf-1);if(cores.some(c=>Math.abs(tx-c)<2.6&&tz<zl+0.8&&tz>zl-6.8))R();else roofTree(tx,yr,tz);}
  if(p.num){push(L/2+0.02,0,0,-HP);digits(String(p.num),0,yr*0.45,0,Math.min(6,yr*0.3),COL.white);pop();}
  pop();
  return cores;
}

// ================= POINT TOWER =================
function pointTower(p){
  const S=p.size||24,n=p.floors,FH=3,det=Math.max(1,p.detail||0),dmg=p.damage||0,h=S/2;
  const gb=groundBase(p.x,p.z,S,S,p.ry);if(p.baseY!=null){gb.bot=Math.min(gb.bot,p.baseY);gb.top=p.baseY;}
  reserve(footAABB(p.x,p.z,S+2,S+2,p.ry),'tower');
  push(p.x,gb.top,p.z,p.ry,{base:gb.top});
  const wallC=p.wall||COL.panel,pc=p.paint||COL.teal;
  box(0,gb.bot-gb.top-2,0,S,gb.top-gb.bot+2-0.4,S,COL.conD);
  if(!F.tilt){TOWERS.push({x:p.x,z:p.z,ry:p.ry,base:gb.top,n,h,S,hole:p.hole||null});for(const sz of [-1,1])LIFTS.push({bx:p.x,bz:p.z,bry:p.ry,lx:3.5,lz:sz*1.9,yl:0,cx0:-2.25,cx1:-0.35,w:2.0,dw:1.1,stops:[...Array(n).keys()].map(f=>gb.top+f*3),name:'tower'});addBPad(footAABB(p.x,p.z,S+3,S+3,p.ry),gb.top-0.05,9);}
  const xs=-2,zl=3.2;
  const lift=[{x0:1.2,x1:3.2,z0:-3,z1:-0.8},{x0:1.2,x1:3.2,z0:0.8,z1:3}];
  const nb=Math.round(S/3);
  for(let f=0;f<n;f++){
    const y=f*FH,full=det>=2||(det===1&&f===0);
    const holes=[];if(f>=1){holes.push(stairHole(xs,zl,1));holes.push(...lift);}
    if(f>=1&&chance(dmg*0.5))holes.push({x0:rnd(5,8),x1:9.5,z0:rnd(-9,-6),z1:-4});
    const hz=p.hole&&f>=p.hole[0]&&f<=p.hole[1];if(hz)holes.push({x0:4.5,x1:h+0.1,z0:-h-0.1,z1:h+0.1});
    slabR(-h,h,-h,h,y,f===0?0.4:0.25,holes,COL.conL);
    if(hz)for(let i=0;i<6;i++){const zz=rnd(-h,h);beamL([4.5,y-0.1,zz],[4.5+rnd(0.3,1.4),y-rnd(0.5,2),zz+rnd(-0.5,0.5)],0.035,0.035,COL.rust,{nc:true});}
    for(const side of [0,1,2,3]){
      if(hz&&side===3)continue;
      push(0,0,0,side*HP);
      const ops=[];for(let b=0;b<nb;b++){const bx=-h+1.5+3*b;
        if(f===0&&side===0&&Math.abs(bx)<2)ops.push({x:bx,w:2.4,sill:0,top:2.6});
        else if(p.doorSide&&p.doorSide.side===side&&p.doorSide.floors.includes(f)&&Math.abs(bx)<2)ops.push({x:bx,w:2.4,sill:0,top:2.6});
        else if(chance(dmg*0.1))ops.push({x:bx,w:2.7,sill:0.1,top:2.8});
        else ops.push({x:bx,w:1.5,sill:0.9,top:2.3});}
      if(hz&&(side===0||side===2)){const o2=ops.filter(o=>side===0?o.x<4:o.x>-4);if(side===0)wallRun(-h+0.3,4.5,h-0.15,0.3,y,FH,o2,wallC);else wallRun(-4.5,h-0.3,h-0.15,0.3,y,FH,o2,wallC);}
      else wallRun(-h+0.3,h-0.3,h-0.15,0.3,y,FH,ops,wallC);
      box(-h+0.15,y,h-0.15,0.3,FH,0.3,wallC,{flat:true});
      if(side%2===0&&f>=1&&chance(0.35)&&!hz){const bx=pick([-7.5,-4.5,4.5,7.5]);box(bx,y-0.2,h+0.6,2.6,0.2,1.2,COL.conL);box(bx,y,h+1.15,2.6,1.0,0.08,pc);balconyRail(bx,y,h,1.2,2.6);}
      pop();
    }
    // core walls (always, they block views)
    wallRun(-3.5,3.5,3.5,0.15,y,FH,[{x:xs,w:1.0,sill:0,top:2.1}],pc);
    wallRun(-3.5,3.5,-3.5,0.15,y,FH,[],pc);
    wallRunZ(-3.5,3.5,-3.575,0.15,y,FH,[],pc);
    wallRunZ(-3.5,3.5,3.575,0.15,y,FH,[{x:-1.9,w:1.1,sill:0,top:2.1},{x:1.9,w:1.1,sill:0,top:2.1}],pc);
    wallRunZ(-3.4,3.4,-0.45,0.12,y,FH,[],COL.conD);
    wallRun(0.5,3.5,0,0.12,y,FH,[],COL.conD);
    if(det>=1||f<2)stairs(xs,zl,1,y,FH,det,COL.conL);
    if(full){
      const ring=6;
      wallRun(-ring,ring,ring,0.15,y,FH,f===0?[{x:-3,w:0.9,sill:0,top:2.1},{x:3,w:0.9,sill:0,top:2.1}]:[{x:-3,w:0.9,sill:0,top:2.1},{x:3,w:0.9,sill:0,top:2.1}],COL.white);
      wallRun(-ring,ring,-ring,0.15,y,FH,f===0?[{x:0,w:2.4,sill:0,top:2.4}]:[{x:-3,w:0.9,sill:0,top:2.1},{x:3,w:0.9,sill:0,top:2.1}],COL.white);
      wallRunZ(-ring,ring,-ring,0.15,y,FH,[],COL.white);wallRunZ(-ring,ring,ring,0.15,y,FH,[],COL.white);
      if(f>0){
        wallRunZ(ring,h-0.3,0,0.12,y,FH,[],COL.white);wallRunZ(-h+0.3,-ring,0,0.12,y,FH,[],COL.white);
        wallRun(ring,h-0.3,0,0.12,y,FH,[],COL.white);wallRun(-h+0.3,-ring,0,0.12,y,FH,[],COL.white);
        for(const sx of [-1,1])for(const sz of [-1,1])wallRunZ(sz>0?ring:-h+0.3,sz>0?h-0.3:-ring,sx*ring,0.12,y,FH,[{x:sz*9,w:0.9,sill:0,top:2.1}],COL.white);
        for(const sx of [-1,1])for(const sz of [-1,1]){if(true)continue;const loot=chance(0.3);
          furn('bed',sx*9,sz*10.6,y,0);furn('wardrobe',sx*11.3,sz*8,y,sx>0?-HP:HP);furn('sofa',sx*3,sz*(6.7),y,sz>0?0:PI);
          furn('counter',sx*11.3,sz*3,y,sx>0?-HP:HP);furn('stove',sx*11.3,sz*1,y,sx>0?-HP:HP);furn('table',sx*8.6,sz*2.6,y,0);furn('chair',sx*8.6,sz*1.8,y,rnd(-0.5,0.5));
          furn('rad',sx*3,sz*11.5,y,0);trash(sx*1,sx*11,sz*1,sz*11,y,loot?6:2);}
      }
    }
  }
  entrance(0,h,0,1,5.6);
  const yr=n*FH;
  slabR(-h,h,-h,h,yr,0.3,det>=1?[stairHole(xs,zl,1)]:[],COL.conD);
  box(0,yr,h-0.12,S,1,0.25,COL.con);box(0,yr,-h+0.12,S,1,0.25,COL.con);box(h-0.12,yr,0,0.25,1,S,COL.con);box(-h+0.12,yr,0,0.25,1,S,COL.con);
  if(det>=1){wallRunZ(-2.8,3.2,-3.575,0.15,yr,3,[],COL.con);wallRunZ(-2.8,3.2,-0.425,0.15,yr,3,[{x:2.6,w:0.9,sill:0,top:2.1}],COL.con);wallRun(-3.6,-0.4,-2.8,0.15,yr,3,[],COL.con);wallRun(-3.6,-0.4,3.2,0.15,yr,3,[],COL.con);box(xs,yr+3,0.2,3.4,0.25,6.4,COL.conD);}
  else box(xs,yr,0.2,3.2,2.8,6,COL.con);
  box(2.2,yr,0,3,3,7,COL.con);
  antenna(-7,yr,-7);roofKit(4,h-1,-h+1,h-1,yr);
  if(p.num){push(0,0,h+0.02,0);digits(String(p.num),0,yr*0.5,0,6,COL.white);pop();}
  pop();
}

// ================= CORRIDOR BLOCK (schools, hospitals, offices) =================
function corridorBlock(p){
  const L=p.len,D=p.depth||15,n=p.floors,FH=p.fh||3,det=p.detail==null?2:p.detail,cw=p.cw||2.4,rw=p.rw||6,zf=D/2;
  const single=p.single;
  const cz0=single?zf-0.3-cw:-cw/2,cz1=single?zf-0.3:cw/2;
  const coreZl=single?cz0:cz1,coreS=single?1:-1;
  const cores=p.cores||[-L/2+4.5,L/2-4.5];
  const win=p.win||{w:1.6,sill:0.9,top:FH-0.6};
  if(p.reserve!==false)reserve(footAABB(p.x,p.z,L,D,p.ry),'civic');
  const gb=groundBase(p.x,p.z,L,D,p.ry);
  const y0=p.y0!=null?p.y0:gb.top;if(p.y0==null)addBPad(footAABB(p.x,p.z,L+3,D+3,p.ry),y0-0.05,9);
  push(p.x,y0,p.z,p.ry,{base:p.base!=null?p.base:y0});
  if(p.y0==null)box(0,gb.bot-gb.top-2,0,L,gb.top-gb.bot+2-0.4,D,COL.conD);
  const wallC=p.wall||COL.panel,pc=p.paint||COL.teal;
  const nb=Math.round(L/3);
  const coreAt=x=>cores.some(c=>Math.abs(c-x)<3);
  for(let f=0;f<n;f++){
    const y=f*FH;
    const holes=[];if(f>=1)for(const c of cores)holes.push(stairHole(c,coreZl,coreS));
    if(p.holes)holes.push(...p.holes(f));
    slabR(-L/2,L/2,-zf,zf,y,f===0?0.4:0.25,holes,COL.conL);
    for(const side of [1,-1]){
      const ops=[];for(let b=0;b<nb;b++){const bx=-L/2+1.5+3*b;ops.push({x:bx,w:win.w,sill:win.sill,top:win.top});}
      if(p.doors)for(const d of p.doors)if(d.side===side&&(d.f==null?f===0:d.f.includes(f))){for(let i=ops.length-1;i>=0;i--)if(Math.abs(ops[i].x-d.x)<(d.w/2+1.5))ops.splice(i,1);ops.push({x:d.x,w:d.w,sill:0,top:d.top||2.4});}
      wallRun(-L/2+0.3,L/2-0.3,side*(zf-0.15),0.3,y,FH,ops,wallC);
    }
    for(const side of [1,-1]){
      const ops=[];if(p.endDoors)for(const d of p.endDoors)if(d.side===side&&(d.f==null?true:d.f.includes(f)))ops.push({x:d.z,w:d.w,sill:0,top:d.top||2.4});
      if(!ops.length&&p.endWin)ops.push({x:0,w:1.5,sill:0.9,top:FH-0.6});
      wallRunZ(-zf,zf,side*(L/2-0.15),0.3,y,FH,ops,wallC);
    }
    if(det>=2||(det===1&&f===0)){
      const roomSides=single?[[-zf+0.3,cz0]]:[[cz1,zf-0.3],[-zf+0.3,cz0]];
      const slots=[];for(let x=-L/2+rw;x<L/2-1;x+=rw)slots.push(x);
      for(const [za,zb] of roomSides){
        const zc=Math.abs(za-cz0)<0.01||Math.abs(zb-cz0)<0.01?cz0:cz1;
        const ops=[];
        const fixOps=[];for(let x=-L/2;x<L/2-0.5;x+=rw){const m=x+rw/2;if(coreAt(m)){continue;}ops.push({x:m-rw/4,w:1.0,sill:0,top:2.2});
          const nearCore=dx=>cores.some(c=>Math.abs(dx-c)<2.3);let dx=m-rw/4;if(nearCore(dx))dx=m+rw/4;if(!nearCore(dx))fixOps.push({x:dx,w:1.0,sill:0,top:2.2});}
        for(const c of cores)if(zc===coreZl)ops.push({x:c,w:2.8,sill:0,top:2.6});
        if(p.openPlan&&p.openPlan(f))continue;
        {const zw=zc+(zc===cz1?0.075:-0.075),coreOps=ops.filter(o=>o.w>2);DRY=true;wallRun(-L/2+0.3,L/2-0.3,zw,0.15,y,FH,ops,COL.white);DRY=false;
         NORNG=true;wallRun(-L/2+0.3,L/2-0.3,zw,0.15,y,FH,fixOps.concat(coreOps),COL.white);NORNG=false;}
        for(const x of slots){if(coreAt(x)||coreAt(x-1.6)||coreAt(x+1.6))continue;wallRunZ(Math.min(za,zb),Math.max(za,zb),x,0.12,y,FH,[],COL.white);}
        if(p.furnish&&f<n&&false){const zfac=zc===cz0?Math.min(za,zb):Math.max(za,zb),sgn=zc===cz0?1:-1,zm=(za+zb)/2;
          for(let x=-L/2;x<L/2-0.5;x+=rw){const m=x+rw/2;if(coreAt(m)||chance(0.15))continue;
            if(p.furnish==='ward'){for(const dx of [-1.8,0,1.8])if(chance(0.8))furn('hbed',m+dx,zfac+sgn*1.3,y,HP+(sgn>0?0:PI));furn('cabinet',m+rw/2-0.6,zm,y,-HP);}
            else if(p.furnish==='office'){furn('desk',m-1.2,zm,y,0);furn('chair',m-1.2,zm-0.7,y,0);furn('desk',m+1.2,zm,y,0);furn('cabinet',m,zfac+sgn*0.4,y,sgn>0?0:PI);if(chance(0.5))furn('cabinet',m+1.2,zfac+sgn*0.4,y,sgn>0?0:PI);}
            else if(p.furnish==='class'){for(let r=0;r<3;r++)for(const dx of [-1.3,1.3])furn('desk',m+dx,zm+(r-1)*1.7*sgn,y,0);box(m,y+0.9,zfac+sgn*0.2,2.8,1.2,0.05,COL.green,{nc:true});}
            furn('rad',m,zfac+sgn*0.2,y,0);trash(m-rw/2+0.5,m+rw/2-0.5,Math.min(za,zb)+0.4,Math.max(za,zb)-0.4,y,3);}
        }
      }
    }
    for(const c of cores){
      for(const sx of [-1,1])wallRunZ(Math.min(coreZl,coreZl-coreS*6),Math.max(coreZl,coreZl-coreS*6),c+sx*1.575,0.15,y,FH,[],pc);
      stairs(c,coreZl,coreS,y,FH,det>=1?det:1,COL.conL);
    }
    if(p.perFloor)p.perFloor(f,y);
  }
  if(p.y0==null&&p.doors)for(const d of p.doors)if(d.f==null)entrance(d.x,d.side*zf,0,d.side,d.w+0.4);
  const yr=n*FH;
  slabR(-L/2,L/2,-zf,zf,yr,0.3,[...cores.map(c=>stairHole(c,coreZl,coreS)),...(p.roofHoles||[])],COL.conD);
  box(0,yr,zf-0.12,L,0.9,0.25,COL.con);box(0,yr,-zf+0.12,L,0.9,0.25,COL.con);box(L/2-0.12,yr,0,0.25,0.9,D,COL.con);box(-L/2+0.12,yr,0,0.25,0.9,D,COL.con);
  for(const c of cores){const za=Math.min(coreZl,coreZl-coreS*6),zb=Math.max(coreZl,coreZl-coreS*6);
    wallRunZ(za,zb,c-1.575,0.15,yr,3,[],COL.con);wallRunZ(za,zb,c+1.575,0.15,yr,3,[{x:coreZl-coreS*0.6,w:0.9,sill:0,top:2.1}],COL.con);
    wallRun(c-1.65,c+1.65,coreZl-coreS*6,0.15,yr,3,[],COL.con);box(c,yr+3,(za+zb)/2,3.4,0.25,6.2,COL.conD);}
  if(p.roof)p.roof(yr);
  pop();
}

// ================= INDUSTRIAL HALL =================
function hall(p){
  const L=p.len,W=p.span,Hh=p.h,ry=p.ry||0;
  reserve(footAABB(p.x,p.z,L+4,W+4,ry),'hall');
  const gb=groundBase(p.x,p.z,L,W,ry);addBPad(footAABB(p.x,p.z,L+4,W+4,ry),gb.top-0.05,9);
  push(p.x,gb.top,p.z,ry,{base:gb.top});HALLS.push({x:p.x,z:p.z,ry,L,W,h:Hh,base:gb.top});
  const wc=p.wall||pick([COL.con,COL.brick,COL.conL]);
  box(0,gb.bot-gb.top-1.5,0,L,gb.top-gb.bot+1.5-0.3,W,COL.conD);
  slabR(-L/2,L/2,-W/2,W/2,0,0.3,[],COL.wet);
  const nb=Math.max(1,Math.round(L/6));
  for(const side of [1,-1]){
    const ops=[];for(let b=0;b<nb;b++){const bx=-L/2+3+6*b;if(chance(0.85))ops.push({x:bx,w:4.4,sill:2.6,top:Hh-1.6});}
    if(p.sideDoor)ops.push({x:0,w:5,sill:0,top:5});
    wallRun(-L/2,L/2,side*(W/2-0.2),0.4,0,Hh,ops,wc);
  }
  for(const side of [1,-1]){
    const dw=p.endDoorW||Math.min(7,W*0.4);const ops=[{x:0,w:dw,sill:0,top:Math.min(Math.max(7,dw*0.7),Hh-2)}];
    if(p.opasno&&side===-1)ops.push({x:W/2-6,w:1.6,sill:0,top:2.4});
    for(let z=-W/2+4;z<W/2-3;z+=6)if(Math.abs(z)>5)ops.push({x:z,w:3,sill:3,top:Hh-1.8});
    wallRunZ(-W/2,W/2,side*(L/2-0.2),0.4,0,Hh,ops,wc);
    {const gh=ops[0].top,hs=((Math.sin(p.x*12.9898+p.z*78.233+side*3.1)*43758.5453)%1+1)%1,oh=Math.min(gh-0.6,2.4+hs*2.6),sx=side*(L/2-0.48);
     box(sx,oh,0,0.07,gh-oh,dw,COL.steel,{m:MAT.steel,flat:true});box(sx,oh-0.12,0,0.12,0.12,dw,COL.rust,{nc:true,flat:true});
     box(side*(L/2-0.75),gh-0.1,0,0.55,0.55,dw+0.4,COL.conD,{nc:true,flat:true});for(const zz of [-dw/2-0.06,dw/2+0.06])box(sx,0,zz,0.14,gh,0.1,COL.steel,{nc:true,flat:true});}
  }
  for(let x=-L/2+6;x<L/2-1;x+=6)for(const side of [1,-1])box(x,0,side*(W/2-1),0.6,Hh,0.6,COL.conD);
  // crane rails + crane
  for(const side of [1,-1])box(0,Hh-2.4,side*(W/2-1),L-1,0.5,0.5,COL.rust,{nc:true});
  const cx=rnd(-L/3,L/3);box(cx,Hh-2.0,0,2,1.2,W-2,COL.yellow,{nc:true});box(cx,Hh-3.2,rnd(-W/4,W/4),1.4,1.2,1.4,COL.rust,{nc:true});
  // catwalk
  if(p.catwalk!==false){
    const lv=p.levels||[Math.round(Hh*0.5)];let prev=0;
    lv.forEach((cy,i)=>{
      for(const side of [1,-1]){box(0,cy-0.2,side*(W/2-1.4),L-2,0.2,1.6,COL.rust);railL(-L/2+1,side*(W/2-2.25),L/2-1,side*(W/2-2.25),cy,COL.rust);}
      const sx=i%2?L/2-3:-L/2+3,dir=i%2?-1:1;
      flight(sx,-W/2+1.4,prev,sx+dir*(cy-prev)*1.6,-W/2+1.4,cy,1.2,COL.rust,true);
      box(-L/2+1.5,cy-0.2,0,1.6,0.2,W-2,COL.rust);box(L/2-1.5,cy-0.2,0,1.6,0.2,W-2,COL.rust);
      if(L>100)for(let x=-L/2+30;x<L/2-20;x+=30)box(x,cy-0.2,0,1.4,0.2,W-2,COL.rust);
      prev=cy;
    });
    if(lv.length>1)box(-L/2+9,lv[0]-0.2,-W/2+6,12,3.2,8,COL.conL);
  }
  if(p.turbines)for(let i=0;i<6;i++){const x=-L/2+18+i*28;box(x,0,0,12,3.2,7,COL.steel);cyl(x+4,3.2,0,2.4,2.4,3,10,COL.green,{coll:true});box(x-4,3.2,0,3,1.6,3,COL.steel);}
  if(p.reactor){cyl(0,0,0,9,9,12,16,COL.conD,{coll:true});cyl(0,12,0,6,6,1.2,12,COL.steel);
    for(const s of [-1,1]){box(0,11.8,s*11,24,0.2,2,COL.rust);box(s*11,11.8,0,2,0.2,20,COL.rust);railL(-12,s*12,12,s*12,12,COL.rust);}
    flight(-L/2+1.5,-11,0,-12.6,-11,12,1.4,COL.rust,true);
    box(-L/2+0.5,0,W/2-8.4,0.3,2.4,1.6,COL.red,{nc:true});}
  // roof
  if(p.roof==='saw'){
    for(let x=-L/2;x<L/2-0.1;x+=9){
      const x0=x,x1=Math.min(L/2,x+9);
      hexa([toW(x0,Hh,-W/2),toW(x1,Hh+3,-W/2),toW(x1,Hh+3,W/2),toW(x0,Hh,W/2),toW(x0,Hh+0.3,-W/2),toW(x1,Hh+3.3,-W/2),toW(x1,Hh+3.3,W/2),toW(x0,Hh+0.3,W/2)],COL.conD);
      if(chance(0.7))box(x1-0.1,Hh,0,0.12,3,W,COL.glass,{nc:true});
      {const a=toWpre(x0,Hh+0.3,0),b=toWpre(x1,Hh+3.3,0);rampW(a[0],a[2],a[1],b[0],b[2],b[1],W);}
      for(const side of [1,-1])hexa([toW(x0,Hh,side*W/2),toW(x1,Hh,side*W/2),toW(x1,Hh+3,side*W/2),toW(x1,Hh+3,side*W/2),toW(x0,Hh,side*W/2-side*0.3),toW(x1,Hh,side*W/2-side*0.3),toW(x1,Hh+3,side*W/2-side*0.3),toW(x1,Hh+3,side*W/2-side*0.3)],wc);
    }
  }else{
    const holes=[];for(let x=-L/2+6;x<L/2-6;x+=12)if(chance(0.6))holes.push({x0:x,x1:x+4,z0:-W/4,z1:W/4});
    slabR(-L/2,L/2,-W/2,W/2,Hh+0.4,0.4,holes,COL.conD);
    for(const hh of holes)box((hh.x0+hh.x1)/2,Hh+0.4,0,4,1.2,W/2,COL.glass,{nc:true});
  }
  roofLadder(-L/2+2.5,-W/2-0.35,Hh+(p.roof==='saw'?0.3:0.4));
  {const dw=p.endDoorW||Math.min(7,W*0.4);entrance(L/2,0,1,0,dw);entrance(-L/2,0,-1,0,dw);}
  // machines
  for(let i=0;i<(p.machines||3);i++){const mx=rnd(-L/2+6,L/2-6),mz=rnd(-W/4,W/4);box(mx,0,mz,rnd(3,7),rnd(1.5,3.5),rnd(2,4),pick([COL.steel,COL.rust,COL.green]));}
  rubble(rnd(-L/3,L/3),0,rnd(-W/4,W/4),5,8,COL.con);
  pop();
}

// ================= TERRACED BLOCK =================
function terrace(p){
  const L=p.len,D=p.depth,n=p.floors,FH=3,step=p.step||3;
  reserve(footAABB(p.x,p.z,L+4,D+2,p.ry),'res');
  const gb=groundBase(p.x,p.z,L,D,p.ry);addBPad(footAABB(p.x,p.z,L+6,D+3,p.ry),gb.top-0.05,9);
  push(p.x,gb.top,p.z,p.ry,{base:gb.top});
  box(0,gb.bot-gb.top-2,0,L,gb.top-gb.bot+2-0.4,D,COL.conD);
  const nb=Math.round(L/3);
  for(let f=0;f<n;f++){
    const y=f*FH,d=D-f*step,z0=-D/2,z1=z0+d;
    slabR(-L/2,L/2,z0,z1,y,0.3,[],COL.conL);
    const ops=[];for(let b=0;b<nb;b++)ops.push({x:-L/2+1.5+3*b,w:b%3===1?1.0:2.2,sill:b%3===1?0:0.8,top:2.4});
    wallRun(-L/2+0.3,L/2-0.3,z1-0.15,0.3,y,FH,ops,COL.panel);
    wallRun(-L/2+0.3,L/2-0.3,z0+0.15,0.3,y,FH,ops.map(o=>({x:o.x,w:1.4,sill:0.9,top:2.3})),COL.panel);
    wallRunZ(z0,z1,-L/2+0.15,0.3,y,FH,[{x:z0+1.5,w:1,sill:0,top:2.2}],COL.panel);wallRunZ(z0,z1,L/2-0.15,0.3,y,FH,[],COL.panel);
    for(let x=-L/2+6;x<L/2-1;x+=6)wallRunZ(z0+0.3,z1-0.3,x,0.12,y,FH,[{x:z1-1.5,w:0.9,sill:0,top:2.1}],COL.white);
    if(f>=1){railL(-L/2,z1+step-0.1,L/2,z1+step-0.1,y,COL.rust);}
    // exterior stair on -x gable
    flight(-L/2-1,z0+1.5+(f%2?4:0),y,-L/2-1,z0+1.5+(f%2?0:4),y+FH,1.2,COL.conL,true);
    box(-L/2-1,y-0.25,z0+(f%2?1:5)+0.5,1.4,0.25,1.6,COL.conL);
  }
  entrance(-L/2-1.6,-D/2+1.5,-1,0,1.4);
  const yr=n*FH,d=D-(n-1)*step;slabR(-L/2,L/2,-D/2,-D/2+d,yr,0.3,[],COL.conD);railL(-L/2,-D/2+d-0.1,L/2,-D/2+d-0.1,yr,COL.rust);
  if(chance(0.7))roofTree(0,yr,-D/2+d/2);
  pop();
}

// ================= UNFINISHED FRAME =================
function frameBld(p){
  const nx=p.nx||4,nz=p.nz||2,n=p.floors,FH=3,L=nx*6,D=nz*6;
  reserve(footAABB(p.x,p.z,L+2,D+2,p.ry),'frame');
  const gb=groundBase(p.x,p.z,L,D,p.ry);addBPad(footAABB(p.x,p.z,L+3,D+3,p.ry),gb.top-0.05,8);
  push(p.x,gb.top,p.z,p.ry,{base:gb.top});
  box(0,gb.bot-gb.top-1,0,L,gb.top-gb.bot+1-0.3,D,COL.conD);
  for(let f=0;f<n;f++){
    const y=f*FH;
    for(let i=0;i<=nx;i++)for(let k=0;k<=nz;k++){if(f>n-3&&chance(0.3))continue;box(-L/2+i*6,y,-D/2+k*6,0.5,FH,0.5,COL.con);}
    for(let i=0;i<nx;i++)for(let k=0;k<nz;k++){
      if(f>0&&(chance(0.18+f*0.02)||(i===0&&k===0)))continue;
      box(-L/2+i*6+3,y-0.25+(f===0?0:FH),-D/2+k*6+3,5.6,0.25,5.6,COL.conL);
    }
    for(let i=0;i<nx;i++){box(-L/2+i*6+3,y+FH-0.6,-D/2,6,0.6,0.4,COL.con,{nc:true});box(-L/2+i*6+3,y+FH-0.6,D/2,6,0.6,0.4,COL.con,{nc:true});}
    if(f<n-1)flight(-L/2+1,-D/2+3+(f%2?2:-2),y+(f===0?0:0),-L/2+5,-D/2+3+(f%2?2:-2),y+FH,1.2,COL.conL,true);
  }
  const yr=n*FH;
  for(let i=0;i<=nx;i++)for(let k=0;k<=nz;k++)for(let r=0;r<4;r++)beamL([-L/2+i*6+rnd(-0.2,0.2),yr,-D/2+k*6+rnd(-0.2,0.2)],[-L/2+i*6+rnd(-0.6,0.6),yr+rnd(0.8,1.8),-D/2+k*6+rnd(-0.6,0.6)],0.03,0.03,COL.rust,{nc:true});
  pop();
}
// ================= HERO BUILDINGS =================
const TREES=[],WATER=[],LIGHTS=[];
function water(x0,x1,z0,z1,y){WATER.push({x0,x1,z0,z1,y});}
function waterL(lx0,lx1,lz0,lz1,ly){const a=toW(lx0,ly,lz0),b=toW(lx1,ly,lz0),c=toW(lx1,ly,lz1),d=toW(lx0,ly,lz1);WATER.push({q:[a,b,c,d]});}
function tiltZ(px,py,th){const c=Math.cos(th),s=Math.sin(th);return (x,y,z)=>[px+(x-px)*c+(y-py)*s,py-(x-px)*s+(y-py)*c,z];}
function tiltX(py,pz,th){const c=Math.cos(th),s=Math.sin(th);return (x,y,z)=>[x,py+(y-py)*c-(z-pz)*s,pz+(y-py)*s+(z-pz)*c];}

// ---------- TOWER 245 ----------
const T245={x:100,z:-130};
function tower245(){
  const X=T245.x,Z=T245.z,h=15,FH=3,N=32;
  reserve({x0:X-17,x1:X+20,z0:Z-17,z1:Z+17},'hero');
  push(X,0,Z,0,{base:-6,mat:1});
  const NC={x:-13.2,zl:-6,s:1},SC={x:13.2,zl:6,s:-1};
  const lifts=[{x0:-4,x1:-2,z0:-5.6,z1:-3.6},{x0:2,x1:4,z0:-5.6,z1:-3.6}];
  const voidF=f=>f>=18&&f<=24;
  for(const L of lifts)LIFTS.push({bx:X,bz:Z,bry:0,lx:(L.x0+L.x1)/2,lz:L.z1,yl:Math.PI/2,cx0:-1.95,cx1:-0.12,w:1.9,dw:1.1,stops:[...Array(18).keys()].map(f=>f*FH),name:'Tower 245'});
  const wallC=COL.panel;
  for(let f=-2;f<N;f++){
    const y=f*FH,vd=voidF(f);
    const holes=[];
    if(f>-2){holes.push(stairHole(NC.x,NC.zl,NC.s),stairHole(SC.x,SC.zl,SC.s));if(!vd&&!voidF(f-1))holes.push(...lifts);}
    if(f===1)holes.push({x0:-11,x1:11,z0:-3.4,z1:5.6});
    if(f>=9&&f<=16){if(chance(0.7))holes.push({x0:rnd(-9,0),x1:rnd(2,8),z0:-13,z1:-9.5});if(chance(0.5))holes.push({x0:rnd(-8,0),x1:rnd(2,6),z0:9,z1:12.5});}
    if(vd){
      const jag=[];for(let i=0;i<4;i++){const xx=rnd(-12,10);jag.push({x0:xx,x1:xx+rnd(2,4),z0:-7.6,z1:-5.9});const x2=rnd(-12,10);jag.push({x0:x2,x1:x2+rnd(2,4),z0:5.9,z1:7.6});}
      slabR(-h,h,-h,-6,y,0.3,holes.concat(jag),COL.conL);slabR(-h,h,6,h,y,0.3,holes.concat(jag),COL.conL);
      for(const sz of [-1,1])for(let i=0;i<7;i++){const xx=rnd(-14,14);beamL([xx,y-0.15,sz*6],[xx+rnd(-0.4,0.4),y-rnd(0.6,2.2),sz*(6-rnd(-0.3,1.2))],0.035,0.035,COL.rust,{nc:true});}
    }else slabR(-h,h,-h,h,y,f===-2?0.5:0.3,holes,COL.conL);
    if(f<0){
      for(const s of [-1,1]){wallRun(-h,h,s*(h-0.2),0.4,y,FH,f===-2&&s===1?[{x:0,w:1.4,sill:0,top:2.3}]:[],COL.conD);wallRunZ(-h,h,s*(h-0.2),0.4,y,FH,[],COL.conD);}
      if(f===-2){for(let i=0;i<3;i++)cyl(-6+i*5,y,-1,1.4,1.4,3.2,10,COL.rust,{coll:true});box(6,y,9,4,2,3,COL.steel);}
    }else{
      // N & S faces
      for(const s of [-1,1]){
        const ops=[];for(let b=0;b<10;b++){const bx=-h+1.5+3*b;
          if(f===0&&s===1&&Math.abs(bx)<2)ops.push({x:bx,w:3,sill:0,top:2.8});
          else if(f>=9&&f<=16&&chance(0.12))ops.push({x:bx,w:2.7,sill:0.1,top:2.8});
          else ops.push({x:bx,w:1.6,sill:0.9,top:2.35});}
        wallRun(-h+0.3,h-0.3,s*(h-0.15),0.3,y,FH,ops,wallC);
      }
      // E & W faces
      for(const s of [-1,1]){
        const ops=[];for(let b=0;b<10;b++){const bz=-h+1.5+3*b;
          if(s===1&&f<=14&&Math.abs(bz-1.5)<0.1)ops.push({x:bz,w:1.1,sill:0,top:2.2});
          else if(s===-1&&(f===4||f===6)&&Math.abs(bz+7.5)<0.1)ops.push({x:bz,w:2.2,sill:0,top:2.6});
          else ops.push({x:bz,w:1.6,sill:0.9,top:2.35});}
        if(vd){wallRunZ(-h,-6,s*(h-0.15),0.3,y,FH,ops,wallC);wallRunZ(6,h,s*(h-0.15),0.3,y,FH,ops,wallC);}
        else wallRunZ(-h,h,s*(h-0.15),0.3,y,FH,ops,wallC);
      }
    }
    // stairs
    const nSkip=f>=9&&f<=11,sSkip=f>=10&&f<=13;
    if(!nSkip)stairs(NC.x,NC.zl,NC.s,y,FH,3,COL.conL);else rubble(NC.x,y,-9,1.5,6,COL.con);
    if(!sSkip)stairs(SC.x,SC.zl,SC.s,y,FH,3,COL.conL);else rubble(SC.x,y,9,1.5,6,COL.con);
    for(const C of [NC,SC]){const za=Math.min(C.zl,C.zl-C.s*6),zb=Math.max(C.zl,C.zl-C.s*6);
      wallRunZ(za,zb,C.x+1.575,0.15,y,FH,[],COL.teal);}
    if(f>=0&&!vd){
      // band walls with doors (flats in halves), elevators
      const fl=f>=25;
      for(const s of [-1,1]){
        const ops=[{x:s<0?NC.x:SC.x,w:2.9,sill:0,top:2.6}];
        if(fl)ops.push({x:-6,w:4,sill:0,top:2.6},{x:6,w:4,sill:0,top:2.6});
        else ops.push({x:s<0?-5:5,w:0.9,sill:0,top:2.1},{x:s<0?8:-8,w:0.9,sill:0,top:2.1});
        wallRun(-h+0.3,h-0.3,s*6.07,0.15,y,FH,f===0?ops.concat([{x:0,w:8,sill:0,top:2.8}]):ops,COL.teal);
      }
      if(!voidF(f+1)||true){for(const L of lifts){wallRun(L.x0-0.1,L.x1+0.1,L.z0-0.07,0.12,y,FH,[],COL.conD);wallRunZ(L.z0,L.z1,L.x0-0.06,0.12,y,FH,[],COL.conD);wallRunZ(L.z0,L.z1,L.x1+0.06,0.12,y,FH,[],COL.conD);
        wallRun(L.x0,L.x1,L.z1+0.06,0.12,y,FH,[{x:(L.x0+L.x1)/2,w:1.1,sill:0,top:2.1}],COL.steel);}}
      if(!fl&&f>=2){
        for(const s of [-1,1]){
          wallRunZ(Math.min(s*6,s*(h-0.3)),Math.max(s*6,s*(h-0.3)),s<0?1.5:-1.5,0.12,y,FH,[],COL.white);
          wallRun(s<0?-11.5:-14.7,s<0?14.7:11.5,s*10.5,0.12,y,FH,[{x:-6,w:0.9,sill:0,top:2.1},{x:8,w:0.9,sill:0,top:2.1},{x:s<0?-9:-10,w:0.9,sill:0,top:2.1},{x:s<0?10:6,w:0.9,sill:0,top:2.1}],COL.white);
        }
      }
      if(fl)for(let cx=-9;cx<=9;cx+=6)for(const cz of [-10.5,10.5])box(cx,y,cz,0.6,FH,0.6,COL.con);
    }
    if(f===20||f===22){box(rnd(-8,-4),y-0.08,0,0.5,0.08,12.6,COL.wood);box(rnd(4,8),y-0.08,0,0.4,0.08,12.6,COL.wood);}
    if(f===18){box(-2,y-0.3,0,0.4,0.3,12.4,COL.con);}
  }
  // basement water, lobby water
  waterL(-11,11,-3.4,5.6,0.06);
  // fire escape (east, floors 0..14)
  for(let f=0;f<=14;f++){
    const y=f*FH;
    box(16.4,y-0.15,1.5,2.4,0.15,2.4,COL.rust);
    if(f<14){box(16.4,y+1.5-0.15,11.7,2.4,0.15,2.4,COL.rust);
    flight(16.9,2.7,y,16.9,10.5,y+1.5,1.0,COL.rust,true);
    flight(15.9,10.5,y+1.5,15.9,2.7,y+3,1.0,COL.rust,true);}
    railL(17.65,0.2,17.65,12.9,y,COL.rust,1.0);
  }
  // roof
  const yr=N*FH;
  slabR(-h,h,-h,h,yr,0.4,[stairHole(NC.x,NC.zl,NC.s),stairHole(SC.x,SC.zl,SC.s)],COL.conD);
  box(0,yr,h-0.12,30,1.1,0.25,COL.con);box(0,yr,-h+0.12,30,1.1,0.25,COL.con);box(h-0.12,yr,0,0.25,1.1,30,COL.con);box(-h+0.12,yr,0,0.25,1.1,30,COL.con);
  for(const C of [NC,SC]){const za=Math.min(C.zl,C.zl-C.s*6),zb=Math.max(C.zl,C.zl-C.s*6);
    wallRunZ(za,zb,C.x-1.575,0.15,yr,3,[],COL.con);wallRunZ(za,zb,C.x+1.575,0.15,yr,3,[{x:C.zl-C.s*0.6,w:0.9,sill:0,top:2.1}],COL.con);
    wallRun(C.x-1.65,C.x+1.65,C.zl-C.s*6,0.15,yr,3,[],COL.con);box(C.x,yr+3,(za+zb)/2,3.4,0.25,6.2,COL.conD);}
  box(0,yr,-4.6,10,3.4,3,COL.con);
  // mast
  for(let i=0;i<4;i++){const a=i*HP+PI/4;beamL([Math.cos(a)*1.4,yr,Math.sin(a)*1.4],[Math.cos(a)*0.4,yr+15,Math.sin(a)*0.4],0.12,0.12,i%2?COL.red:COL.white,{nc:true});}
  for(let k=1;k<6;k++){const yy=yr+k*2.6,r=1.4-k*0.18;beamL([-r,yy,-r],[r,yy,r],0.05,0.05,COL.steel,{nc:true});beamL([-r,yy,r],[r,yy,-r],0.05,0.05,COL.steel,{nc:true});}
  // radar dish
  push(8,yr,8,0.6);box(0,0,0,0.6,2.5,0.6,COL.rust);
  F.tilt=tiltX(F.oy+3.5,F.oz,0.5);cyl(0,2.5,0,0.4,4.2,1.6,14,COL.rust,{open:true});for(let i=0;i<6;i++){const a=i/6*PI*2;beamL([0,2.5,0],[Math.cos(a)*4.2,4.1,Math.sin(a)*4.2],0.06,0.06,COL.rust,{nc:true});}
  F.tilt=null;pop();
  // signage
  push(0,0,h+0.02,0);digits('245',0,3.4,0,1.6,COL.white);pop();
  push(h+0.02,0,0,-HP);digits('245',-6,57,0,9,COL.white);pop();
  pop();
  // basement corridor to central station
  tube(X,Z+15.2,-6,X,49.4,-19,2.6,2.8,{lamp:12,gaps:[{side:-1,a:-45.3,b:-43.3}]});
}

// ---------- tubes (corridors, subway) ----------

// ---------- tunnel that reaches the surface: enclosed where there is cover, then an open walled trench ----------
// floor: 'stairs' | 'ramp'
function stairTunnel(ax,az,ya,bx,bz,yb,w,hh,o){
  o=o||{};const L=Math.hypot(bx-ax,bz-az),ux=(bx-ax)/L,uz=(bz-az)/L,Y=s=>lerp(ya,yb,s/L);
  const G=s=>H(ax+ux*s,az+uz*s);
  let sOpen=L;for(let s=0;s<=L;s+=0.5){let ok=true;for(const off of [-w/2-0.6,0,w/2+0.6]){if(H(ax+ux*s-uz*off,az+uz*s+ux*off)<Y(s)+hh+1.3){ok=false;break;}}if(!ok){sOpen=Math.max(0,s-0.5);break;}}
  const surf=[];for(let s=0;s<=L+0.01;s+=1)surf.push(Math.max(G(s),Y(s)));
  // floor
  if(o.floor==='ramp'){const n=Math.max(1,Math.ceil(L/10));for(let i=0;i<n;i++){const s0=L*i/n,s1=L*(i+1)/n;flight(ax+ux*s0,az+uz*s0,Y(s0),ax+ux*s1,az+uz*s1,Y(s1),w,o.floorC||COL.conD,false);}}
  else flight(ax,az,ya,bx,bz,yb,w,COL.conL,'m');
  // enclosed part
  if(sOpen>0.5)tube(ax,az,ya,ax+ux*(sOpen+0.4),az+uz*(sOpen+0.4),Y(sOpen+0.4),w,hh,{noFloor:true,lamp:o.lamp||8,wallC:o.wallC||COL.white});
  // headwall over the tunnel mouth + hole in the ground mesh across the transition
  if(sOpen<L-0.5){let g=-1e9;for(let s=sOpen-3;s<=sOpen+2;s+=0.5)for(const off of [-w/2-0.6,0,w/2+0.6])g=Math.max(g,H(ax+ux*s-uz*off,az+uz*s+ux*off));g+=0.5;
    push(ax+ux*(sOpen+0.6),Y(sOpen+0.4)+hh,az+uz*(sOpen+0.6),Math.atan2(uz,ux));box(0,0,0,1.2,Math.max(0.5,g-(Y(sOpen+0.4)+hh)),w+1.6,COL.con);pop();
    addHole(ax+ux*(sOpen+0.2),az+uz*(sOpen+0.2),ux,uz,2.6,w/2+0.75);}
  // open trench part
  if(sOpen<L-0.2){
    for(let s=sOpen;s<L;s+=2){const s1=Math.min(L,s+2),top=Math.max(surf[Math.min(surf.length-1,Math.floor(s))],surf[Math.min(surf.length-1,Math.ceil(s1))])+0.9,y0=Math.min(Y(s),Y(s1))-0.6;
      for(const sd of [-1,1]){push(ax+ux*(s+s1)/2-uz*sd*(w/2+0.25),y0,az+uz*(s+s1)/2+ux*sd*(w/2+0.25),Math.atan2(uz,ux));box(0,0,0,s1-s,top-y0,0.5,COL.con);pop();}}
    const s0=sOpen+0.9,m=w/2+1.05,x0=ax+ux*s0,z0=az+uz*s0,ex=ax+ux*(L+1.5),ez=az+uz*(L+1.5);
    CUTS.push({x0:Math.min(x0,ex)-m,x1:Math.max(x0,ex)+m,z0:Math.min(z0,ez)-m,z1:Math.max(z0,ez)+m,fn:(px,pz)=>{const t=(px-ax)*ux+(pz-az)*uz;if(t<s0)return 1e9;if(Math.abs(-(px-ax)*uz+(pz-az)*ux)>m)return 1e9;return Math.min(t,L)>=L?yb-0.05:Y(t)-0.6;}});
  }
  return {sOpen,L};
}

const TUBES=[];
function tube(ax,az,ya,bx,bz,yb,w,hh,o){
  o=o||{};TUBES.push({ax,az,ya,bx,bz,yb,w,hh,noFloor:!!o.noFloor});if(!o.noGuard)addGuard(ax,az,ya,bx,bz,yb,w+1,hh);

  const dx=bx-ax,dz=bz-az,L=Math.hypot(dx,dz),ang=Math.atan2(dz,dx),t=o.wall||0.5;
  push((ax+bx)/2,0,(az+bz)/2,ang,{base:Math.min(ya,yb)});
  const Y=x=>lerp(ya,yb,(x+L/2)/L);
  const slab=(x0,x1,z0,z1,b,tp,col)=>hexa([toW(x0,Y(x0)+b,z0),toW(x1,Y(x1)+b,z0),toW(x1,Y(x1)+b,z1),toW(x0,Y(x0)+b,z1),toW(x0,Y(x0)+tp,z0),toW(x1,Y(x1)+tp,z0),toW(x1,Y(x1)+tp,z1),toW(x0,Y(x0)+tp,z1)],col);
  let stepFloor=null;
  if(!o.noFloor){const steep=Math.abs(yb-ya)/Math.max(L,0.01)>0.12&&w<5;if(steep)DRY=true;slab(-L/2,L/2,-w/2,w/2,-0.4,0,o.floor||COL.conD);DRY=false;const a=toWpre(-L/2,ya,0),b=toWpre(L/2,yb,0);rampW(a[0],a[2],a[1],b[0],b[2],b[1],w);if(steep)stepFloor=[a,b];}
  const segs=(side)=>{let s=[[-L/2,L/2]];if(o.gaps)for(const g of o.gaps)if(g.side===side){const n=[];for(const [p,q] of s){if(g.b<=p||g.a>=q)n.push([p,q]);else{if(g.a>p)n.push([p,g.a]);if(g.b<q)n.push([g.b,q]);}}s=n;}return s;};
  for(const side of [-1,1])for(const [p,q] of segs(side)){
    slab(p,q,side>0?w/2:-w/2-t,side>0?w/2+t:-w/2,-0.4,hh+0.4,o.wallC||COL.con);
    const nC=Math.max(1,Math.ceil((q-p)/4));
    for(let k=0;k<nC;k++){const p0=p+(q-p)*k/nC,p1=p+(q-p)*(k+1)/nC,y0=Math.min(Y(p0),Y(p1)),y1=Math.max(Y(p0),Y(p1));
      const a=toWpre((p0+p1)/2,0,side*(w/2+t/2));addSolid({cx:a[0],cz:a[2],c:F.c,s:F.s,hx:(p1-p0)/2,hz:t/2,y0:y0-0.6,y1:y1+hh+0.4});}
  }
  slab(-L/2,L/2,-w/2-t,w/2+t,hh,hh+0.5,COL.conD);
  if(o.capB){if(o.loopOpen){DRY=true;box(L/2-0.2,yb-0.4,0,0.4,hh+0.8,w+2*t,COL.con);DRY=false;}else box(L/2-0.2,yb-0.4,0,0.4,hh+0.8,w+2*t,COL.con);}
  if(o.lamp)for(let x=-L/2+o.lamp/2;x<L/2;x+=o.lamp){const yy=Y(x)+hh-0.15;box(x,yy,0,1.2,0.12,0.25,COL.lamp,{nc:true,e:true});}
  if(o.rails&&Math.abs(ya-yb)<0.01)for(const tz of [-2.5,2.5]){for(const r of [-0.75,0.75])box(0,ya,tz+r,L,0.16,0.08,COL.steel,{nc:true});}
  if(o.flood){const [p,q]=o.flood;waterL(p,q,-w/2,w/2-1.6,ya+0.55);box((p+q)/2,ya,w/2-0.8,q-p,1.0,1.6,COL.conL);}
  pop();
  if(stepFloor){const [a,b]=stepFloor;const sv=NORNG;NORNG=true;flight(a[0],a[2],a[1],b[0],b[2],b[1],w-0.1,o.floor||COL.conD,'m');NORNG=sv;for(const sd of [-1,1]){const ux=(b[0]-a[0]),uz=(b[2]-a[2]),Lw=Math.hypot(ux,uz)||1,px=-uz/Lw*sd*(w/2-0.15),pz=ux/Lw*sd*(w/2-0.15);beamL([a[0]+px,a[1]+0.95,a[2]+pz],[b[0]+px,b[1]+0.95,b[2]+pz],0.04,0.04,COL.rust,{nc:true,flat:true});}}
}
function station(cx,cz,o){
  const L=100,W=20,yb=o.y!=null?o.y:-20,hh=9;
  push(cx,0,cz,o.ry||0,{base:yb});
  box(0,yb-0.6,0,L,0.6,W,COL.conD);
  for(const s of [-1,1]){box(0,yb,s*(W/2-2),L-8,1,4,COL.conL);box(0,yb+1,s*(W/2-4.15),L-8,0.02,0.3,COL.yellow,{nc:true});for(const e of [-1,1])flight(e*(L/2-4),s*(W/2-2),yb+1,e*(L/2-0.4),s*(W/2-2),yb,4,COL.conL,'m');}
  for(const s of [-1,1]){
    const ops=[];if(o.doors)for(const d of o.doors)if(d.side===s)ops.push({x:d.x,w:d.w||3,sill:1,top:4});
    wallRun(-L/2,L/2,s*(W/2+0.3),0.6,yb-0.6,hh+1.2,ops,COL.white);
    for(let x=-40;x<=40;x+=20){const mc=pick([COL.mosaicB,COL.red,COL.ochre,COL.teal]);box(x,yb+4.5,s*(W/2-0.05),8,3,0.1,mc,{nc:true});box(x,yb+5.4,s*(W/2-0.12),3,1.2,0.1,COL.white,{nc:true});}
  }
  for(const s of [-1,1]){const cl=s<0?o.closedW:o.closedE,op=[{x:0,w:12,sill:0.6,top:6.6}];if(cl&&o.loopOpen){DRY=true;wallRunZ(-W/2-0.6,W/2+0.6,s*(L/2+0.3),0.6,yb-0.6,hh+1.2,[],COL.white);DRY=false;NORNG=true;wallRunZ(-W/2-0.6,W/2+0.6,s*(L/2+0.3),0.6,yb-0.6,hh+1.2,op,COL.white);NORNG=false;}else wallRunZ(-W/2-0.6,W/2+0.6,s*(L/2+0.3),0.6,yb-0.6,hh+1.2,cl?[]:op,COL.white);}
  box(0,yb+hh,0,L,0.6,W+1.2,COL.conD);box(0,yb+hh-1.4,0,L,1.4,8,COL.con,{nc:true});
  for(const s of [-1,1])box(0,yb+hh-0.7,s*7,L,0.7,6,COL.con,{nc:true});
  for(let x=-45;x<=45;x+=10)for(const s of [-1,1])box(x,yb+1,s*(W/2-4.6),0.8,hh-1,0.8,COL.conL);
  for(let x=-45;x<=45;x+=10)box(x,yb+hh-1.5,0,4,0.1,0.4,COL.lamp,{nc:true,e:true});
  for(const tz of [-2.5,2.5])for(const r of [-0.75,0.75])box(0,yb,tz+r,L,0.16,0.08,COL.steel,{nc:true});
  if(o.train){for(let i=0;i<3;i++){const x=-30+i*20;box(x,yb+0.4,-2.5,19,3.3,2.7,COL.blue);box(x,yb+2.2,-2.5,18.4,0.8,2.75,COL.glass,{nc:true});}}
  for(let x=-30;x<=30;x+=20)box(x,yb+1,W/2-1,2,0.45,0.5,COL.wood);
  pop();
}
function subway(){
  station(-480,85,{doors:[{side:-1,x:25},{side:-1,x:-25}],closedW:true,loopOpen:true});
  station(100,60,{doors:[{side:-1,x:30},{side:-1,x:0,w:3},{side:-1,x:-30}],train:true});
  station(300,140,{doors:[{side:1,x:30},{side:-1,x:-30}]});
  tube(-430,85,-20,50,60,-20,12,6,{rails:true,lamp:25,flood:[-165,-45]});
  tube(150,60,-20,250,140,-20,12,6,{rails:true,lamp:25});
  tube(350,140,-20,382,140,-20,12,6,{rails:true,lamp:25,gaps:[{side:-1,a:4,b:16}],capB:true,loopOpen:true});
  tube(376,134,-20,376,-330,-20,12,6,{lamp:25});
  stairTunnel(376,-330,-20,376,-412,H(376,-412),12,6,{floor:'ramp',lamp:20,wallC:COL.con});
  // entrances
  reserve({x0:124,x1:136,z0:5,z1:51},'ent');reserve({x0:-461,x1:-449,z0:30,z1:76},'ent');reserve({x0:324,x1:336,z0:146,z1:190},'ent');reserve({x0:355,x1:397,z0:-412,z1:-326},'ent');
  const ent=(x,z0,z1)=>{const top=H(x,z1);stairTunnel(x,z0,-19,x,z1,top,3.2,3,{});
    const segD=(px,pz,r)=>{const [ax,az,bx,bz]=r.p,L2=(bx-ax)**2+(bz-az)**2||1,t=Math.max(0,Math.min(1,((px-ax)*(bx-ax)+(pz-az)*(bz-az))/L2));return Math.hypot(px-ax-(bx-ax)*t,pz-az-(bz-az)*t);};
    const inRoadAt=zc=>ROADS.some(r=>[[-2.5,-3],[2.5,-3],[-2.5,3],[2.5,3],[0,0]].some(([dx,dz])=>segD(x+dx,zc+dz,r)<r.w/2+0.3));
    let off=z1>z0?3:-3;if(inRoadAt(z1+off))off=-off;
    push(x,top,z1+off,0);for(const a of [-2,2])for(const b of [-2.5,2.5])box(a,0,b,0.3,3,0.3,COL.con);box(0,3,0,5,0.3,6,COL.conL);pop();};
  ent(130,49.4,13);ent(-455,74.4,38);ent(330,150.6,184);
  // bunker
  {const top=H(330,-460);stairTunnel(330,-491,-8,330,-460,top,2.8,3,{});}
  push(330,-8,-505,0,{base:-8});
  slabR(-12,12,-14,14,0,0.4,[],COL.conD);slabR(-12,12,-14,14,3.6,0.4,[],COL.conD);
  for(const s of [-1,1]){wallRun(-12,12,s*14,0.6,0,3.6,s>0?[{x:0,w:2.2,sill:0,top:2.4}]:[],COL.con);wallRunZ(-14,14,s*12,0.6,0,3.6,s<0?[{x:0,w:2.2,sill:0,top:2.4}]:[],COL.con);}
  wallRun(-12,12,6,1.0,0,3.6,[{x:0,w:1.6,sill:0,top:2.2}],COL.conD);box(1.6,0,7.4,0.3,2.2,1.6,COL.steel);
  for(let i=0;i<5;i++)for(const s of [-1,1]){box(s*9,0,-10+i*3.6,2,0.5,0.9,COL.steel);box(s*9,1.5,-10+i*3.6,2,0.1,0.9,COL.steel,{nc:true});}
  box(0,0,-11,3,2.5,2,COL.green);for(let z=-10;z<=10;z+=5)box(0,3.3,z,1.2,0.1,0.25,COL.lamp,{nc:true,e:true});
  pop();
  push(330,0,-459,0);box(-2.2,0,0,0.8,3.4,6,COL.conD);box(2.2,0,0,0.8,3.4,6,COL.conD);box(0,3.4,0,5.4,0.7,6.4,COL.con);pop();
}

// ---------- ADMIN BUILDING ----------
function adminBuilding(){
  const X=10,Z=-142;
  reserve({x0:-37,x1:57,z0:-167,z1:-117},'hero');
  push(X,0,Z,0,{base:0});
  const L=90,D=45,FH=4.5,cores=[-24,24];
  for(let f=0;f<2;f++){
    const y=f*FH;
    const holes=[];if(f===1){holes.push(...cores.map(c=>stairHole(c,1.2,-1)),{x0:-15,x1:15,z0:8,z1:20});}
    if(f===0)holes.push({x0:-1.5,x1:1.5,z0:-14,z1:-9.2});
    slabR(-L/2,L/2,-D/2,D/2,y,0.4,holes,COL.conL);
    for(const s of [-1,1]){
      const ops=[];for(let x=-L/2+1.5;x<L/2;x+=3)ops.push({x,w:2.4,sill:0.5,top:4.0});
      if(f===0&&s===1)for(const dx of [-6,0,6]){for(let i=ops.length-1;i>=0;i--)if(Math.abs(ops[i].x-dx)<1.6)ops.splice(i,1);ops.push({x:dx,w:2.6,sill:0,top:3.4});}
      wallRun(-L/2+0.3,L/2-0.3,s*(D/2-0.15),0.3,y,FH,ops,COL.conL);
      const zo=[];for(let z=-D/2+1.5;z<D/2;z+=3)zo.push({x:z,w:2.4,sill:0.5,top:4.0});
      wallRunZ(-D/2,D/2,s*(L/2-0.15),0.3,y,FH,zo,COL.conL);
    }
    for(let x=-L/2+1.5;x<L/2;x+=3)box(x,y,D/2+0.6,0.5,FH,0.5,COL.con);
    wallRun(-L/2+0.3,L/2-0.3,-8,0.15,y,FH,[-36,-30,-18,-12,-6,6,12,18,30,36].map(x=>({x,w:1,sill:0,top:2.4})).concat([{x:0,w:3,sill:0,top:2.6}]),COL.white);
    for(let x=-39;x<=39;x+=6)if(Math.abs(x)>3)wallRunZ(-D/2+0.3,-8,x,0.12,y,FH,[],COL.white);
    for(const c of cores){for(const sx of [-1,1])wallRunZ(1.2,7.2,c+sx*1.575,0.15,y,FH,[],COL.blue);stairs(c,1.2,-1,y,FH,3,COL.conL);}
    if(f===0)for(let x=-12;x<=12;x+=6)box(x,0,14,0.9,9,0.9,COL.con);
  }
  // shelter
  stairs(0,-9.2,1,-4,4,3,COL.conL);
  slabR(-12,12,-21,-8,-4,0.4,[],COL.conD);
  for(const s of [-1,1])wallRunZ(-21,-8,s*12,0.4,-4,4,[],COL.conD);
  wallRun(-12,12,-21,0.4,-4,4,[],COL.conD);wallRun(-12,12,-8,0.4,-4,4,[{x:0,w:3,sill:0,top:2.5}],COL.conD);
  wallRun(-12,12,-14.6,0.8,-4,4,[{x:-6,w:1.4,sill:0,top:2.2}],COL.con);
  for(let i=0;i<6;i++){box(-10.5+i*4,-4,-19.5,2,0.5,0.9,COL.steel);box(-10.5+i*4,-2.6,-19.5,2,0.08,0.9,COL.steel,{nc:true});}
  for(let x=-9;x<=9;x+=6)box(x,-0.3,-17,1.2,0.12,0.25,COL.lamp,{nc:true,e:true});
  box(8,-4,-11,3,2.2,2,COL.green);
  // slab tower
  corridorBlock({x:0,z:0,ry:0,len:60,depth:15,floors:12,y0:9,base:0,cores,reserve:false,detail:3,furnish:'office',
    endDoors:[{side:1,z:4,w:2.2,f:[1,3],top:2.5}],
    roof:(yr)=>{
      for(const [a,b] of [[-2.5,-2.5],[2.5,-2.5],[2.5,2.5],[-2.5,2.5]])beamL([a,yr,b],[a*0.3,yr+6,b*0.3],0.25,0.25,COL.rust,{nc:true});
      const pts=[];for(let i=0;i<10;i++){const r=i%2?1.6:4,a=HP+i*PI/5;pts.push([Math.cos(a)*r,Math.sin(a)*r]);}
      prismXY(pts,0,yr+10,0,0.6,COL.red,{mat:1});
    }});
  // relief on south face
  push(0,0,7.5+0.2,0);
  box(0,24,0,12,12,0.4,COL.red,{nc:true});
  for(let i=0;i<12;i++){const a=-0.2+i*0.28,r=3.6;box(Math.cos(a)*r-0.5,30+Math.sin(a)*r,0.3,0.7,0.7,0.25,COL.ochre,{nc:true});}
  box(1,27.5,0.3,0.6,5.5,0.25,COL.ochre,{nc:true});box(1,32.6,0.3,2.6,0.9,0.25,COL.ochre,{nc:true});
  pop();
  pop();
  // skybridges
  for(const [y,gap] of [[12,false],[18,true]]){
    push(62.5,0,-138,0,{base:0});
    const L=45;
    if(gap){slabR(-L/2,L/2,-1.5,1.5,y,0.3,[{x0:-1,x1:0.8,z0:-2,z1:2}],COL.conL);}else slabR(-L/2,L/2,-1.5,1.5,y,0.3,[],COL.conL);
    box(0,y+2.8,0,L,0.3,3.4,COL.conD);
    for(const s of [-1,1]){const ops=[];for(let x=-L/2+2;x<L/2-1;x+=3)ops.push({x,w:2.4,sill:1.0,top:2.4});wallRun(-L/2,L/2,s*1.6,0.2,y,2.8,ops,COL.conL);}
    box(-6,0,0,1,y-0.3,1,COL.con);box(10,0,0,1,y-0.3,1,COL.con);
    pop();
  }
}

// ---------- UNIVERMAG ----------
function univermag(){
  const X=0,Z=45,L=90,D=60,FH=5;
  reserve({x0:X-46,x1:X+46,z0:Z-31,z1:Z+33},'hero');
  push(X,0,Z,0,{base:0});
  const A={x0:-15,x1:15,z0:-10,z1:10};
  const C1={x:-40,zl:-24,s:1},C2={x:40,zl:24,s:-1};
  for(let f=0;f<3;f++){
    const y=f*FH;const holes=[];
    if(f>=1)holes.push(A,stairHole(C1.x,C1.zl,C1.s),stairHole(C2.x,C2.zl,C2.s));
    if(f===2)holes.push({x0:-0.5,x1:9.4,z0:11,z1:13});
    slabR(-L/2,L/2,-D/2,D/2,y,0.4,holes,COL.conL);
    for(const s of [-1,1]){
      const ops=[];for(let x=-L/2+4.5;x<L/2;x+=9){if(f===0){if(s===-1&&[-18,0,18].some(d=>Math.abs(d-x)<5))ops.push({x,w:3.2,sill:0,top:3.4});else if(s===1&&Math.abs(x-31.5)<1)ops.push({x,w:5,sill:0,top:4.4});else ops.push({x,w:6,sill:0.5,top:4.2});}else ops.push(chance(0.15)?{x,w:7.5,sill:1,top:4.6}:{x,w:7,sill:3.4,top:4.4});}
      wallRun(-L/2+0.3,L/2-0.3,s*(D/2-0.2),0.4,y,FH,ops,f===0?COL.conD:COL.conL);
      const zo=[];for(let z=-D/2+4.5;z<D/2;z+=9)zo.push(f===0?{x:z,w:6,sill:0.5,top:4.2}:{x:z,w:6,sill:3.4,top:4.4});
      wallRunZ(-D/2,D/2,s*(L/2-0.2),0.4,y,FH,zo,f===0?COL.conD:COL.conL);
    }
    for(let x=-36;x<=36;x+=9)for(let z=-22.5;z<=22.5;z+=9){if(x>A.x0-1&&x<A.x1+1&&z>A.z0-1&&z<A.z1+1)continue;box(x,y,z,0.8,FH,0.8,COL.con);}
    if(f>=1){railL(A.x0,A.z0,A.x1,A.z0,y);railL(A.x0,A.z1,A.x1,A.z1,y);railL(A.x0,A.z0,A.x0,A.z1,y);railL(A.x1,A.z0,A.x1,A.z1,y);}
    for(const C of [C1,C2]){const za=Math.min(C.zl,C.zl-C.s*6),zb=Math.max(C.zl,C.zl-C.s*6);for(const sx of [-1,1])wallRunZ(za,zb,C.x+sx*1.575,0.15,y,FH,[],COL.blue);stairs(C.x,C.zl,C.s,y,FH,3,COL.conL);}
    for(let i=0;i<5;i++){const x=rnd(-40,40),z=rnd(-26,26);if(x>A.x0-2&&x<A.x1+2&&z>A.z0-2&&z<A.z1+2)continue;wallRun(x-4,x+4,z,0.12,y,3,[{x,w:1.2,sill:0,top:2.2}],COL.white);}
    for(let i=0;i<8;i++){const x=rnd(-40,40),z=rnd(-26,26);if(x>A.x0-1&&x<A.x1+1&&z>A.z0-1&&z<A.z1+1)continue;box(x,y,z,rnd(1.5,4),1.1,0.7,COL.wood);}
  }
  flight(-8,-1.3,0,-8,-10.2,5,1.3,COL.steel,true);box(-8.8,0,-5.7,0.15,5.5,9,COL.steel,{nc:true});
  flight(-0.3,12,5,9.2,12,10,1.3,COL.steel,true);
  const yr=3*FH;
  slabR(-L/2,L/2,-D/2,D/2,yr,0.5,[A,stairHole(C1.x,C1.zl,C1.s),stairHole(C2.x,C2.zl,C2.s)],COL.conD);
  for(let x=A.x0;x<=A.x1;x+=3)if(chance(0.75))box(x,yr-0.4,0,0.25,0.4,20,COL.rust,{nc:true});
  for(let z=A.z0;z<=A.z1;z+=5)if(chance(0.6))box(0,yr-0.4,z,30,0.3,0.2,COL.rust,{nc:true});
  box(0,yr,D/2-0.12,L,1,0.25,COL.con);box(0,yr,-D/2+0.12,L,1,0.25,COL.con);box(L/2-0.12,yr,0,0.25,1,D,COL.con);box(-L/2+0.12,yr,0,0.25,1,D,COL.con);
  for(const C of [C1,C2]){const za=Math.min(C.zl,C.zl-C.s*6),zb=Math.max(C.zl,C.zl-C.s*6);wallRunZ(za,zb,C.x-1.575,0.15,yr,3,[],COL.con);wallRunZ(za,zb,C.x+1.575,0.15,yr,3,[{x:C.zl-C.s*0.6,w:0.9,sill:0,top:2.1}],COL.con);wallRun(C.x-1.65,C.x+1.65,C.zl-C.s*6,0.15,yr,3,[],COL.con);box(C.x,yr+3,(za+zb)/2,3.4,0.25,6.2,COL.conD);}
  box(30,yr,-18,8,3,6,COL.con);box(-28,yr,20,6,2,4,COL.steel);
  rubble(4,0,-2,6,14,COL.conL);
  waterL(-15,15,-10,10,0.08);
  box(31.5,-0.6,D/2+5,8,0.6,10,COL.conD);
  pop();
}

// ---------- SCHOOL No.5 ----------
function school(){
  const X=120,Z=-330;
  reserve({x0:X-38,x1:X+50,z0:Z-26,z1:Z+26},'hero');
  const gb=groundBase(X,Z,72,48,0);
  push(X,gb.top,Z,0,{base:gb.top});
  box(0,gb.bot-gb.top-2,0,96,gb.top-gb.bot+2-0.4,48,COL.conD);
  const FH=3.3,win={w:2.4,sill:0.8,top:2.9},pc=COL.green,wl=COL.conL;
  corridorBlock({x:0,z:18,ry:PI,len:72,depth:12,floors:3,fh:FH,single:true,y0:0,reserve:false,detail:3,cores:[-30,30],win,paint:pc,wall:wl,rw:6,
    doors:[{side:-1,x:0,w:3,top:2.8},{side:1,x:25.5,w:2.2,f:[0,1,2]},{side:1,x:-25.5,w:2.2,f:[0,1,2]}]});
  corridorBlock({x:-30,z:-6,ry:-HP,len:36,depth:12,floors:3,fh:FH,single:true,y0:0,reserve:false,detail:3,furnish:'class',cores:[13.5],win,paint:pc,wall:wl,
    endDoors:[{side:-1,z:4.5,w:2.2}]});
  corridorBlock({x:30,z:-6,ry:HP,len:36,depth:12,floors:3,fh:FH,single:true,y0:0,reserve:false,detail:3,furnish:'class',cores:[-13.5],win,paint:pc,wall:wl,
    endDoors:[{side:1,z:4.5,w:2.2}],doors:[{side:-1,x:6,w:2.4,top:2.6}]});
  // classroom furniture (ground + 1st floor)
  for(let f=0;f<2;f++)for(let x=-27;x<=27;x+=6){if(Math.abs(Math.abs(x)-30)<4)continue;for(let r=0;r<3;r++)for(let c=0;c<2;c++)box(-x+(c?1.2:-1.2),f*FH,17+r*1.8+1.5,1.1,0.75,0.55,COL.wood,{nc:true});box(-x,f*FH+1,23.6,2.8,1.2,0.05,COL.green,{nc:true});}
  // sports hall
  push(42,0,0,0);
  slabR(-6,6,-12,12,0,0.4,[],COL.wood);
  for(const s of [-1,1]){const ops=[];for(let z=-10.5;z<=10.5;z+=3)ops.push({x:z,w:2.4,sill:4,top:6.5});wallRunZ(-12,12,s*5.8,0.4,0,7.5,s<0?ops.concat([{x:0,w:2.4,sill:0,top:2.6}]):ops,COL.conL);
    wallRun(-6,6,s*11.8,0.4,0,7.5,[],COL.conL);}
  box(0,7.5,0,12.4,0.4,24.4,COL.conD);
  for(let z=-10;z<=10;z+=1)box(5.4,0,z,0.12,3,0.06,COL.wood,{nc:true});
  for(const s of [-1,1]){box(0,0,s*11.3,0.3,3,0.3,COL.steel);box(0,3,s*10.9,1.6,1,0.1,COL.white,{nc:true});}
  waterL(-5.6,5.6,-11.6,11.6,0.05);
  // mosaic on east wall exterior
  push(6.02,0,0,-HP);
  for(let i=0;i<16;i++)for(let j=0;j<12;j++){const u=i-7.5,v=j-6.5;const d=Math.hypot(u,v*1.1);let c=COL.mosaicB;if(d<3.2)c=COL.ochre;else if(d<4.3)c=COL.white;else if(d<5.2)c=COL.red;if(j<2)c=COL.red;box(-4+i*0.5,0.8+j*0.5,0,0.46,0.46,0.06,c,{nc:true,flat:true});}
  pop();
  pop();
  // yard
  box(0,-0.1,-6,40,0.12,28,COL.asph,{nc:true});
  pop();
}

// ---------- HOSPITAL ----------
function hospital(){
  const X=-528,Z=-20;
  reserve({x0:X-9,x1:X+54,z0:Z-32,z1:Z+32},'hero');
  const gb=groundBase(X+15,Z,70,64,0);
  push(X,gb.top,Z,0,{base:gb.top});
  box(15,gb.bot-gb.top-2,-5,64,gb.top-gb.bot+2-0.4,64,COL.conD);
  corridorBlock({x:0,z:0,ry:HP,len:60,depth:15,floors:9,y0:0,reserve:false,detail:3,furnish:'ward',cores:[-24,24],wall:COL.white,paint:COL.teal,
    doors:[{side:-1,x:-22.5,w:2,f:[0,1,2]},{side:-1,x:6,w:3,top:2.8}]});
  corridorBlock({x:30,z:-22.5,ry:0,len:45,depth:15,floors:3,y0:0,reserve:false,detail:3,furnish:'office',cores:[18],wall:COL.white,paint:COL.teal,
    endDoors:[{side:-1,z:0,w:2}]});
  push(-12,0,6,0);box(0,3,0,6,0.3,4,COL.conL,{nc:true});box(-2.5,0,1.5,0.3,3,0.3,COL.con);box(2.5,0,1.5,0.3,3,0.3,COL.con);pop();
  pop();
}

// ---------- COLLAPSED TOWER ----------
function collapsedTower(){
  const X=80,Z=238,th=0.35;
  reserve({x0:X-14,x1:X+30,z0:Z-14,z1:Z+14},'hero');
  resSlab({x:X+28,z:Z,ry:HP,len:48,floors:9,detail:1,damage:0.6});
  const tf=tiltZ(X+12,0,th);
  push(0,0,0,0,{tilt:tf});
  pointTower({x:X,z:Z,ry:0,size:24,floors:16,detail:1,damage:0.5});
  pop();
  FOOT.pop();
  for(let f=0;f<=16;f++){const a=tf(X-12,f*3,Z),b=tf(X+12,f*3,Z);rampW(a[0],Z,a[1],b[0],Z,b[1],23);}
  rubble(X-14,0,Z,8,40,COL.con);
  // fallen floor slabs: tilted panels you can climb, propped on smaller chunks, with snapped rebar
  for(let i=0;i<10;i++){const bx=X-12+rnd(-6,4),bz=Z+rnd(-12,12),ang=rnd(0,PI);push(bx,0,bz,ang);const w=rnd(3,6),h=rnd(1,4),d=rnd(2,4);DRY=true;box(0,0,0,w,h,d,COL.conL);DRY=false;pop();
    const sv=NORNG;NORNG=true;try{const g=H(bx,bz),hs=k=>((Math.sin(bx*12.9898+bz*78.233+k*37.719)*43758.5453)%1+1)%1;push(bx,g,bz,ang);
      const len=Math.max(w,d),wid=Math.min(w,d)+0.4,rise=Math.min(h,len*0.5);
      beamL([-len/2,0.12,0],[len/2,rise+0.12,0],wid,0.3,COL.conL);const a=toW(-len/2,0.27,0),b=toW(len/2,rise+0.27,0);rampW(a[0],a[2],a[1],b[0],b[2],b[1],wid*0.9);
      push(len/2-0.7,0,0,0.3);chunk(1.1,Math.max(0.3,rise-0.15),Math.min(1.4,wid*0.6),COL.con);pop();
      for(let k=0;k<3;k++){push((hs(k)-0.5)*len,0,(hs(k+5)<0.5?-1:1)*(wid/2+0.5),hs(k+9)*PI);chunk(0.4+hs(k+2)*0.9,0.2+hs(k+3)*0.5,0.4+hs(k+4)*0.8,k%2?COL.con:[0.3,0.29,0.27]);pop();}
      for(let k=0;k<4;k++){const t=(k+0.5)/4-0.5;beamL([t*len,rise*(t+0.5)+0.2,wid/2],[t*len+(hs(k+11)-0.5)*0.6,rise*(t+0.5)+0.5+hs(k+12)*0.6,wid/2+0.4+hs(k+13)*0.5],0.025,0.025,COL.rust,{nc:true});}
      pop();}finally{NORNG=sv;}}
}
// ================= INFRASTRUCTURE =================
const LADDERS=[];
function setupCuts(){
  CUTS.push({x0:85.4,x1:114.6,z0:-144.6,z1:-115.4,y:-9});addHole(100,-130,1,0,14.9,14.9);
  CUTS.push({x0:-2,x1:22,z0:-163,z1:-150,y:-5.5});addHole(10,-156.5,1,0,12.5,7);
  const tr=(x,za,zb,ya,yb)=>CUTS.push({x0:x-2.8,x1:x+2.8,z0:Math.min(za,zb)-0.5,z1:Math.max(za,zb)+0.5,fn:(px,pz)=>lerp(ya,yb,clamp((pz-za)/(zb-za),0,1))-0.7});

  CUTS.push({x0:529,x1:551,z0:-1000,z1:1000,fn:(px,pz)=>railGrade(pz),noPatch:true});
}
function dam(){
  reserve({x0:-420,x1:-180,z0:-456,z1:-405},'hero');
  push(-300,0,-446,0,{mat:1,base:-6});
  box(0,-8,-2,230,48,4,COL.con);
  hexa([toW(-115,39,-1.2),toW(115,39,-1.2),toW(115,-7,34.8),toW(-115,-7,34.8),toW(-115,40,0),toW(115,40,0),toW(115,-6,36),toW(-115,-6,36)],COL.con);
  for(let x=-110;x<=110;x+=22)hexa([toW(x-0.6,39.5,0),toW(x+0.6,39.5,0),toW(x+0.6,-6,36),toW(x-0.6,-6,36),toW(x-0.6,40.2,0.5),toW(x+0.6,40.2,0.5),toW(x+0.6,-5.4,36.6),toW(x-0.6,-5.4,36.6)],COL.conD);
  for(const s of [-1,1])beamL([s*15,40,1],[s*15,-6,37],0.6,1.8,COL.conD);
  slabR(-125,125,-4,4,40,1,[{x0:-89.5,x1:-86.5,z0:-4.1,z1:-8.2+11.2}],COL.conL);
  box(0,40,-3.8,250,1.1,0.4,COL.con);box(0,40,3.8,250,1.1,0.4,COL.con);
  for(let x=-110;x<=110;x+=27.5){box(x,41.1,3.8,0.25,6,0.25,COL.steel,{nc:true});beamL([x,47,3.8],[x,47,2],0.1,0.1,COL.steel,{nc:true});box(x,46.8,1.8,0.8,0.2,0.4,COL.lamp,{nc:true,e:true});}
  // shaft + gallery
  for(let f=0;f<10;f++){const y=10+f*3;stairs(-88,-4,-1,y,3,3,COL.conL);for(const sx of [-1,1])wallRunZ(-4,2,-88+sx*1.6,0.2,y,3,[],COL.con);wallRun(-89.7,-86.3,2.1,0.2,y,3,[],COL.con);}
  wallRun(-89.7,-86.3,-4.1,0.2,40,2.6,[{x:-88,w:1,sill:0,top:2.2}],COL.con);box(-88,42.6,-1,3.6,0.25,6.4,COL.conD);
  slabR(-90,80,-8,-4,10,0.3,[],COL.conD);box(-5,13,-6,170,0.3,4.4,COL.conD);
  wallRun(-90,80,-8.15,0.3,10,3,[],COL.con);wallRun(-86.4,80,-3.85,0.3,10,3,[],COL.con);wallRunZ(-8,-4,80.15,0.3,10,3,[],COL.con);wallRunZ(-8,-4,-90.15,0.3,10,3,[],COL.con);
  for(let x=-80;x<=75;x+=12)box(x,12.8,-6,1.2,0.12,0.25,COL.lamp,{nc:true,e:true});
  for(let x=-70;x<=70;x+=35)box(x,10,-7.4,1,1.6,0.8,COL.steel);
  pop();
  WATER.push({x0:-440,x1:-160,z0:-800,z1:-450,y:36});
  hall({x:-300,z:-398,ry:0,len:40,span:18,h:12,roof:'flat',catwalk:false,machines:2,wall:COL.conL});
  // control room on west rim
  const g=H(-450,-466);
  push(-450,g,-466,0,{base:g});
  slabR(-6,6,-4,4,0,0.3,[],COL.conL);
  for(const s of [-1,1]){wallRun(-6,6,s*3.85,0.3,0,3.2,[{x:-3,w:2,sill:1,top:2.6},{x:2,w:2,sill:1,top:2.6}].concat(s>0?[{x:4.5,w:1,sill:0,top:2.2}]:[]),COL.white);wallRunZ(-4,4,s*5.85,0.3,0,3.2,[{x:0,w:2.4,sill:1,top:2.6}],COL.white);}
  box(0,3.2,0,12.6,0.3,8.6,COL.conD);box(-2,0,-2.6,5,1,1,COL.steel);
  pop();
}
function bridges(){
  // footbridge (C3)
  {const z=-120,rx=riverX(z),bed=-riverDepth(z);
   push(rx,0,z,0,{base:bed});
   box(0,0,0,96,0.3,3,COL.rust);
   for(const s of [-1,1]){box(0,2.8,s*1.6,96,0.2,0.2,COL.rust,{nc:true});solidL(0,0.3,s*1.6,96,1.2,0.15);
     for(let x=-48;x<=48;x+=4){box(x,0.3,s*1.6,0.12,2.5,0.12,COL.rust,{nc:true});if(x<48&&!(s>0&&x>8&&x<20))beamL([x,0.3,s*1.6],[x+4,2.8,s*1.6],0.08,0.08,COL.rust,{nc:true});}}
   for(const x of [-18,18])box(x,bed,0,1.4,-bed,1.4,COL.con);
   pop();}
}
const HWZ=380;
function highway(){
  const z=HWZ,rx=riverX(z),g0=rx-30,g1=rx+24,P=HWP,Y=x=>profY(P,x,z);
  reserve({x0:-1000,x1:1000,z0:z-12,z1:z+12},'hwy');
  for(let x=-990;x<990;x+=10){
    const xc=x+5,ya=Y(x),yb=Y(x+10);
    if(!(xc>g0&&xc<g1)){
      hexa([toW(x,ya-1.2,z-10),toW(x+10,yb-1.2,z-10),toW(x+10,yb-1.2,z+10),toW(x,ya-1.2,z+10),toW(x,ya,z-10),toW(x+10,yb,z-10),toW(x+10,yb,z+10),toW(x,ya,z+10)],COL.asph);
      rampW(x,z,ya,x+10,z,yb,20);
      const sb=!(xc>330&&xc<380),nb=!(xc>-565&&xc<-515);
      if(sb)flight(x,z+9.8,ya+0.8,x+10,z+9.8,yb+0.8,0.4,COL.conL,false),solidL(xc,(ya+yb)/2,z+9.8,10,1,0.4);
      if(nb)flight(x,z-9.8,ya+0.8,x+10,z-9.8,yb+0.8,0.4,COL.conL,false),solidL(xc,(ya+yb)/2,z-9.8,10,1,0.4);
      flight(x,z,ya+0.8,x+10,z,yb+0.8,0.5,COL.conL,false);solidL(xc,(ya+yb)/2,z,10,1,0.5);
    }
    const ti=Math.round((x+1000)/10);
    if((x+990)%30===0&&!P.tun[ti]&&!(x>g0+2&&x<g1-2)&&!(x>526&&x<554)&&!NS_X().some(q=>Math.abs(q-x)<11)){const g=H(x,z),y=Y(x);if(g<y-2.5){for(const s of [-1,1])box(x,g,z+s*6,1.4,y-1.2-g,1.4,COL.con);box(x,y-2.2,z,1.8,1,16,COL.con);}}
    if((x+990)%60===0&&!P.tun[ti]&&!(xc>g0&&xc<g1)){const y=Y(xc);box(xc,y+0.8,z,0.25,8,0.25,COL.steel,{nc:true});for(const s of [-1,1]){beamL([xc,y+8.8,z],[xc,y+8.8,z+s*4],0.1,0.1,COL.steel,{nc:true});box(xc,y+8.6,z+s*4,0.8,0.2,0.5,COL.lamp,{nc:true,e:true});}}
  }
  for(let i=0;i<P.ys.length;){if(!P.tun[i]){i++;continue;}let j=i;while(j<P.ys.length&&P.tun[j])j++;const a=i,b=Math.max(i+1,j-1);
    for(let k=a;k<b;k+=2){const e=Math.min(k+2,b);tube(-1000+k*10,z,P.ys[k]-1.2,-1000+e*10,z,P.ys[e]-1.2,26,8,{noFloor:true,lamp:10,wallC:COL.conD});}
    portal(-1000+a*10,z,P.ys[a]-1.2,0,26,8);portal(-1000+b*10,z,P.ys[b]-1.2,0,26,8);ROAD_TUNNELS.push([-1000+(a+b)*5,P.ys[(a+b)>>1],z,0]);i=j;}
  beamW([g0+0.5,Y(g0)-0.8,z],[rx+2,H(rx+2,z)+0.8,z],19,1.2,COL.asph);
  for(const ex of [-990,990]){const y=Y(ex);box(ex+(ex<0?-0.6:0.6),y-1.2,z,1.2,9,26,COL.con);box(ex+(ex<0?0.1:-0.1),y,z,0.1,1.2,18,COL.yellow,{nc:true});}
  const ramp=(xa,xb,zz)=>{const ya=H(xa,zz)+0.2,ye=Y(xb);const n=Math.round(Math.abs(xb-xa)/30);for(let i=0;i<n;i++){const a=lerp(xa,xb,i/n),b=lerp(xa,xb,(i+1)/n),ys=lerp(ya,ye,i/n),yy=lerp(ya,ye,(i+1)/n);flight(a,zz,ys,b,zz,yy,8,COL.asph,false);const g=H(b,zz);if(yy-g>1.5&&!NS_X().some(q=>Math.abs(q-b)<11))box(b,g,zz,1.2,yy-0.3-g,1.2,COL.con);}reserve({x0:Math.min(xa,xb),x1:Math.max(xa,xb),z0:zz-5,z1:zz+5},'hwy');};
  ramp(500,330,HWZ+14);ramp(-380,-540,HWZ-14);
  for(const bx of [150,-420]){const y=Y(bx);box(bx,y+0.8,z-8.5,0.4,8,0.4,COL.rust,{nc:true});box(bx+8,y+0.8,z-8.5,0.4,8,0.4,COL.rust,{nc:true});box(bx+4,y+8.8,z-8.5,11,4.5,0.3,COL.white,{nc:true});box(bx+4,y+8.8,z-8.3,10.4,4,0.05,COL.blue,{nc:true});}
}
// cars removed: the old car builder drew 3 random numbers; this keeps the generator's sequence (and the city layout) unchanged
function keepSeq3(){R();R();R();}
function railway(){
  reserve({x0:526,x1:554,z0:-1000,z1:1000},'rail');
  const gr=[0.40,0.37,0.33];
  const track=(x,za,zb)=>{for(let z=za;z<zb;z+=20){const zc=z+10,g=H(x,zc);box(x,g-0.3,zc,4.4,0.6,20,gr);for(const r of [-0.75,0.75])box(x+r,g+0.3,zc,0.08,0.16,20,COL.steel,{nc:true});}};
  track(537.5,-1000,1000);track(542.5,-1000,1000);
  for(let z=-980;z<980;z+=50){const g=H(546,z);box(546,g,z,0.3,7.5,0.3,COL.steel,{nc:true});beamL([546,g+7,z],[535,g+7,z],0.12,0.12,COL.steel,{nc:true});}
  reserve({x0:445,x1:525,z0:398,z1:560},'yard');
  for(let x=450;x<=520;x+=10)track(x,402,560);
  for(let i=0;i<26;i++){const x=450+10*Math.floor(rnd(0,8)),z=rnd(412,545),g=H(x,z);const open=chance(0.4);push(x,g+0.5,z,0);box(0,0,0,3,open?2.4:3.6,14,pick([COL.rust,COL.brick,COL.green,COL.conD]));if(open)box(0,2.4,0,2.4,0.4,13,COL.dark,{nc:true});pop();}
}
function depot(){
  hall({x:376,z:-480,ry:HP,len:140,span:40,h:11,roof:'flat',catwalk:false,machines:0,endDoorW:14,wall:COL.brick});
  for(const x of [364,376,388])for(const r of [-0.75,0.75])box(x+r,0.3,-480,0.08,0.16,138,COL.steel,{nc:true});
  for(const x of [364,388])for(let i=0;i<4;i++){const z=-538+i*20;box(x,0.5,z,2.7,3.4,19,COL.blue);box(x,2.3,z,2.75,0.8,18.4,COL.glass,{nc:true});
    for(const bz of [-6.8,6.8]){box(x,0.12,z+bz,2.3,0.38,2.8,COL.dark,{flat:true});for(const wz of [-0.9,0.9])for(const wx of [-0.75,0.75])box(x+wx,0.3,z+bz+wz,0.12,0.6,0.6,COL.steel,{nc:true,flat:true});}}
}
function chimney(x,z,striped){
  const g=H(x,z);reserve({x0:x-8,x1:x+8,z0:z-8,z1:z+8},'hero');
  push(x,g,z,0,{mat:1,base:g});
  box(0,-1,0,14,2,14,COL.conD);
  const n=12;for(let i=0;i<n;i++){const r0=lerp(5.5,3.4,i/n),r1=lerp(5.5,3.4,(i+1)/n);const c=striped?(i%2?COL.red:COL.white):(i%3?COL.con:COL.conD);cyl(0,1+i*10,0,r0,r1,10,14,c,{open:true,coll:i===0});}
  beamL([5.7,1,0],[3.7,121,0],0.08,0.4,COL.rust,{nc:true});
  cyl(0,80,0,4.9,4.9,0.25,14,COL.rust,{});
  pop();
}
function waterTower(x,z){
  const g=H(x,z);reserve({x0:x-8,x1:x+8,z0:z-8,z1:z+8},'hero');
  push(x,g,z,0,{base:g});
  for(const [a,b] of [[-4,-4],[4,-4],[4,4],[-4,4]])beamL([a,0,b],[a*0.7,22,b*0.7],0.4,0.4,COL.rust);
  for(let k=1;k<4;k++){const y=k*5.5,r=4-k*0.3;beamL([-r,y,-r],[r,y,-r],0.12,0.12,COL.rust,{nc:true});beamL([r,y,-r],[r,y,r],0.12,0.12,COL.rust,{nc:true});beamL([r,y,r],[-r,y,r],0.12,0.12,COL.rust,{nc:true});beamL([-r,y,r],[-r,y,-r],0.12,0.12,COL.rust,{nc:true});}
  box(0,21.6,0,8,0.4,8,COL.rust);cyl(0,22,0,6,6,9,14,COL.rust);cyl(0,31,0,6.2,0.6,2.4,14,COL.rust);
  beamL([0.6,0,-0.6],[0.6,22,-0.6],0.08,0.3,COL.steel,{nc:true});LADDERS.push({x:x+0.6,z:z-0.6,y0:g,y1:g+22});
  pop();
}
function pipeLine(pts){
  for(let i=0;i<pts.length-1;i++){
    const [ax,az]=pts[i],[bx,bz]=pts[i+1],L=Math.hypot(bx-ax,bz-az),ang=Math.atan2(bz-az,bx-ax);
    let y=-1e9;for(let t=0;t<=1.0001;t+=4/Math.max(4,L))y=Math.max(y,H(lerp(ax,bx,t),lerp(az,bz,t)));y+=3.6;
    reserve({x0:Math.min(ax,bx)-2,x1:Math.max(ax,bx)+2,z0:Math.min(az,bz)-2,z1:Math.max(az,bz)+2},'pipe');
    push((ax+bx)/2,y,(az+bz)/2,ang,{base:y-3.5});
    for(const k of [-0.6,0.6])for(let x=-L/2;x<L/2-0.01;x+=12){const l=Math.min(12,L/2-x);box(x+l/2,0,k,l,0.9,0.9,pick([COL.white,COL.steel,COL.steel,COL.rust]));}
    for(let x=-L/2+2;x<L/2;x+=8){const w=toWpre(x,0,0);if(inOtherRoad(w[0],w[2],null))continue;const g=H(w[0],w[2])-y;box(x,g,-0.6,0.3,-g,0.3,COL.con);box(x,g,0.6,0.3,-g,0.3,COL.con);box(x,-0.3,0,0.4,0.3,2,COL.con);}
    pop();
  }
  for(const [x,z] of [pts[0],pts[pts.length-1]]){const g=H(x+2.5,z);flight(x+2.5,z-6,g,x+2.5,z,g+4.4,1.2,COL.rust,true);}
}
function radioMast(){
  const X=470,Z=-290,g=H(X,Z);reserve({x0:X-25,x1:X+25,z0:Z-25,z1:Z+25},'hero');
  push(X,g,Z,0,{mat:1,base:g});
  const A=[0,1,2].map(i=>i*PI*2/3+PI/6);
  for(let k=0;k<15;k++){const r0=lerp(2.4,0.8,k/15),r1=lerp(2.4,0.8,(k+1)/15);
    for(const a of A)beamL([Math.cos(a)*r0,k*10,Math.sin(a)*r0],[Math.cos(a)*r1,(k+1)*10,Math.sin(a)*r1],0.2,0.2,k%2?COL.red:COL.white,{nc:true});
    for(let j=0;j<2;j++){const y=k*10+j*5+5,r=lerp(2.4,0.8,(k*10+j*5+5)/150);for(let i=0;i<3;i++){const a=A[i],b=A[(i+1)%3];beamL([Math.cos(a)*r,y,Math.sin(a)*r],[Math.cos(b)*r,y,Math.sin(b)*r],0.06,0.06,COL.steel,{nc:true});}}
    for(let i=0;i<3;i++){const a=A[i],b=A[(i+1)%3];beamL([Math.cos(a)*r0,k*10,Math.sin(a)*r0],[Math.cos(b)*r1,(k+1)*10,Math.sin(b)*r1],0.05,0.05,COL.steel,{nc:true});}}
  box(0,40,0,6,0.2,6,COL.rust);railL(-3,-3,3,-3,40.2);railL(3,-3,3,3,40.2);railL(3,3,-3,3,40.2);railL(-3,3,-3,1,40.2);
  beamL([0,0,0],[0,40,0],0.08,0.35,COL.steel,{nc:true});LADDERS.push({x:X,z:Z,y0:g,y1:g+40.2});
  for(const a of A)for(const h of [50,100,145]){const ax=Math.cos(a+PI/3)*75,az=Math.sin(a+PI/3)*75;beamL([0,h,0],[ax,H(X+ax,Z+az)-g,az],0.05,0.05,COL.steel,{nc:true});}
  push(14,0,0,0);slabR(-6,6,-4,4,0,0.3,[],COL.conL);for(const s of [-1,1]){wallRun(-6,6,s*3.85,0.3,0,3.4,s<0?[{x:-3,w:1,sill:0,top:2.2}]:[{x:0,w:3,sill:1.2,top:2.6}],COL.white);wallRunZ(-4,4,s*5.85,0.3,0,3.4,[],COL.white);}box(0,3.4,0,12.4,0.3,8.4,COL.conD);box(2,0,1.5,3,1.8,1,COL.steel);pop();
  pop();
}
function amusement(){
  reserve({x0:-170,x1:130,z0:400,z1:560},'park');
  const fx=-73,fz=460,g=H(fx,fz);
  push(fx,g,fz,0,{mat:1,base:g});
  const Rr=20,ay=23,N=32;
  for(const zz of [-1.2,1.2])for(let i=0;i<N;i++){const a=i/N*PI*2,b=(i+1)/N*PI*2;beamL([Math.cos(a)*Rr,ay+Math.sin(a)*Rr,zz],[Math.cos(b)*Rr,ay+Math.sin(b)*Rr,zz],0.35,0.35,COL.white,{nc:true});}
  for(let i=0;i<16;i++){const a=i/16*PI*2;for(const zz of [-1.2,1.2])beamL([0,ay,zz],[Math.cos(a)*Rr,ay+Math.sin(a)*Rr,zz],0.14,0.14,COL.steel,{nc:true});
    const cx=Math.cos(a)*Rr,cy=ay+Math.sin(a)*Rr;beamL([cx,cy,-1.2],[cx,cy,1.2],0.12,0.12,COL.steel,{nc:true});
    box(cx,cy-2.6,0,1.9,1.9,1.7,[COL.red,COL.yellow,COL.blue,COL.green][i%4],{nc:true});}
  box(0,ay-0.8,0,1.6,1.6,3.6,COL.steel,{nc:true});
  for(const zz of [-1,1])for(const xx of [-1,1])beamL([xx*10,0,zz*5],[0,ay,zz*1.6],0.5,0.5,COL.white);
  box(0,0,4,12,0.6,4,COL.conL);box(4,0.6,4,2.4,2.4,2.4,COL.blue);
  pop();
  // carousel
  {const x=-5,z=440,gg=H(x,z);push(x,gg,z,0,{base:gg});cyl(0,0,0,8,8,0.6,16,COL.wood,{coll:true});for(let i=0;i<12;i++){const a=i/12*PI*2;box(Math.cos(a)*6.5,0.6,Math.sin(a)*6.5,0.12,3.6,0.12,COL.yellow,{nc:true});if(i%2)box(Math.cos(a)*6.5,1.2,Math.sin(a)*6.5,1.2,0.8,0.4,COL.white,{nc:true});}
    box(0,0.6,0,1,3.6,1,COL.red);for(let i=0;i<8;i++)cyl(0,4.2+i*0.0,0,9-i*0.0,0.5,2.6,16,i%2?COL.red:COL.white,{});pop();}
  // empty amusement pavilion
  {const x=55,z=490,gg=H(x,z);push(x,gg,z,0,{base:gg});box(0,0,0,30,0.3,20,COL.steel);for(let i=-14;i<=14;i+=7)for(const s of [-1,1])box(i,0.3,s*9.6,0.4,4.5,0.4,COL.white);box(0,4.8,0,32,0.4,22,COL.red);
    for(let i=0;i<7;i++){rnd(-12,12);rnd(-7,7);rnd(0,PI*2);pick([0,0,0]);R();}pop();}
  for(const [x,z] of [[-125,420],[105,430]]){const gg=H(x,z);push(x,gg,z,0);box(0,0,0,3,2.6,3,COL.blue);box(0,2.6,0,3.6,0.2,3.6,COL.white);pop();}
  for(let x=-165;x<=125;x+=4){if(Math.abs(x+15)<6||Math.abs(x)<9)continue;const gg=H(x,402);box(x,gg,402,0.1,1.8,0.1,COL.steel,{nc:true});}
}
function townSquare(){
  reserve({x0:-62,x1:62,z0:-97,z1:-3},'square');
  for(let i=0;i<20;i++)for(let j=0;j<15;j++){if(chance(0.1))continue;const x=-57+6*i,z=-92+6*j;if(Math.hypot(x,z+60)<7)continue;box(x,-0.05,z,5.86,0.2,5.86,j%5===0?COL.con:COL.conL);}
  push(0,0,-60,0,{base:0});box(0,0.15,0,12,0.6,12,COL.con);box(0,0.75,0,9,0.6,9,COL.con);box(0,1.35,0,6,4,6,COL.conD);cyl(0,5.35,0,1.6,0.5,22,4,COL.con,{coll:true});
  prismXY([0,1,2,3,4,5,6,7,8,9].map(i=>{const r=i%2?0.5:1.3,a=HP+i*PI/5;return [Math.cos(a)*r,Math.sin(a)*r];}),0,28.4,0,0.3,COL.red);pop();
  push(0,0,-22,0,{base:0});cyl(0,0.15,0,7,7,0.8,20,COL.con,{open:true});cyl(0,0.15,0,6.6,6.6,0.6,20,COL.conD,{open:true});cyl(0,0.15,0,6.6,6.6,0.05,20,COL.wet);cyl(0,0.15,0,1,0.7,3,8,COL.con,{coll:true});pop();
  for(let x=-50;x<=50;x+=20)for(const z of [-90,-10]){box(x,0.15,z,3,0.45,0.6,COL.wood);}
  for(let x=-55;x<=55;x+=22)for(const z of [-96,-4])lamp(x,0.15,z);
}
function lamp(x,y,z){box(x,y-0.6,z,0.2,8.1,0.2,COL.steel);beamW([x,y+7.5,z],[x+1.6,y+7.5,z],0.1,0.1,COL.steel,{nc:true});box(x+1.6,y+7.2,z,0.7,0.2,0.4,COL.lamp,{nc:true,e:true});}

// ---------- MARKET SQUARE ----------
function marketSquare(){
  const X=-130,Z=245;reserve({x0:X-50,x1:X+50,z0:Z-35,z1:Z+35},'hero');
  push(X,0,Z,0,{base:0});
  for(let i=0;i<14;i++)for(let j=0;j<10;j++){if(chance(0.08))continue;box(-45+i*6.9+3,-0.05,-31+j*6.9+3,6.8,0.2,6.8,j%3?COL.conL:COL.con);}
  // covered market hall: vaulted
  push(-15,0,-8,0);
  slabR(-22,22,-12,12,0.15,0.3,[],COL.wet);
  for(let x=-22;x<=22;x+=5.5){for(let k=0;k<12;k++){const a0=k/12*PI,a1=(k+1)/12*PI;beamL([x,7+Math.sin(a0)*6,-Math.cos(a0)*12],[x,7+Math.sin(a1)*6,-Math.cos(a1)*12],0.4,0.6,COL.con,{nc:true});}
    for(const s of [-1,1])box(x,0,s*11.8,0.8,7,0.8,COL.con);}
  for(let k=0;k<12;k++){const a0=k/12*PI,a1=(k+1)/12*PI;if(chance(0.25))continue;const z0=-Math.cos(a0)*12,z1=-Math.cos(a1)*12,y0=7+Math.sin(a0)*6,y1=7+Math.sin(a1)*6;
    hexa([toW(-22,y0,z0),toW(22,y0,z0),toW(22,y1,z1),toW(-22,y1,z1),toW(-22,y0+0.25,z0),toW(22,y0+0.25,z0),toW(22,y1+0.25,z1),toW(-22,y1+0.25,z1)],chance(0.3)?COL.glass:COL.conD);}
  for(const s of [-1,1])wallRunZ(-12,12,s*22.2,0.4,0,7,[{x:0,w:5,sill:0,top:4.5},{x:-7,w:3,sill:1.5,top:5.5},{x:7,w:3,sill:1.5,top:5.5}],COL.conL);
  for(let x=-18;x<=18;x+=6)for(const z of [-6,0,6])box(x,0.15,z,4,0.95,1.6,COL.wood);
  pop();
  // open stalls
  for(let r=0;r<3;r++)for(let i=0;i<6;i++){const sx=14+i*5,sz=-20+r*14;box(sx,0.15,sz,4,0.9,1.6,COL.wood);box(sx-1.9,0.15,sz-0.8,0.12,2.8,0.12,COL.steel,{nc:true});box(sx+1.9,0.15,sz-0.8,0.12,2.8,0.12,COL.steel,{nc:true});if(chance(0.7))box(sx,2.95,sz,4.4,0.08,2.6,pick([COL.red,COL.blue,COL.yellow,COL.green,COL.white]),{nc:true});}
  for(const x of [-38,38])for(const z of [-28,28])lamp(x,0.15,z);
  pop();
}
// ---------- HOUSE OF CULTURE ----------
function houseOfCulture(){
  const X=250,Z=-430;reserve({x0:X-32,x1:X+32,z0:Z-26,z1:Z+26},'hero');
  push(X,0,Z,0,{base:0});
  // auditorium block
  slabR(-12,12,-22,8,0,0.4,[],COL.wood);
  for(const s of [-1,1])wallRunZ(-22,8,s*11.8,0.5,0,16,[{x:-16,w:2,sill:0,top:2.6}],COL.conL);
  wallRun(-12,12,-21.8,0.5,0,16,[],COL.conL);
  for(let i=0;i<10;i++){flight(-10,-14+i*2,i*0.5,10,-14+i*2,i*0.5,0,COL.wood,false);box(0,0,-13+i*2,20,i*0.5+0.05,2,COL.wood);}
  box(0,0,4,22,1.2,6,COL.wood);box(0,15.6,-7,25,0.6,31,COL.conD);
  box(0,16,-20,14,6,4,COL.con);
  // foyer with colonnade
  slabR(-28,28,8,24,0,0.4,[],COL.conL);
  for(let x=-26;x<=26;x+=4)box(x,0,23.4,0.9,8,0.9,COL.white);
  box(0,8,16,57,1.4,17,COL.con);
  wallRun(-28,28,8.2,0.4,0,8,[{x:0,w:8,sill:0,top:4}],COL.conL);
  for(const s of [-1,1])wallRunZ(8,24,s*27.8,0.4,0,8,[{x:16,w:3,sill:0,top:3}],COL.conL);
  wallRun(-28,28,20,0.2,0,8,[-20,-12,-4,4,12,20].map(x=>({x,w:5,sill:0,top:6})),COL.glass);
  push(0,0,24.02,0);for(let i=0;i<9;i++)box(-12+i*3,9,0.1,2.6,0.8,0.2,[COL.red,COL.mosaicB,COL.ochre][i%3],{nc:true,flat:true});pop();
  flight(-24,10,0,-24,22,8,1.6,COL.conL,true);
  pop();
}
// ---------- POWER LINE PYLONS ----------
function pylon(x,z,ry){
  const g=H(x,z);push(x,g,z,ry,{base:g});
  const hh=28;for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1]])beamL([a*3,0,b*3],[a*0.8,hh,b*0.8],0.25,0.25,COL.steel,{nc:true});
  for(let k=1;k<6;k++){const y=k*hh/6,r=3-2.2*k/6;beamL([-r,y,-r],[r,y+hh/6,r],0.08,0.08,COL.steel,{nc:true});beamL([r,y,-r],[-r,y+hh/6,r],0.08,0.08,COL.steel,{nc:true});}
  for(const y of [hh-6,hh-2])beamL([0,y,-7],[0,y,7],0.25,0.3,COL.steel,{nc:true});
  solidL(0,0,0,6,3,6);pop();
  return g;
}
function pylons(){
  const pts=[];for(let x=500;x>=-180;x-=95){let px=x;while(NS_X().some(rx=>Math.abs(rx-px)<14))px+=9;pts.push([px,-232]);}
  pts.unshift([640,-120]);
  const tops=pts.map(([x,z])=>{reserve({x0:x-4,x1:x+4,z0:z-4,z1:z+4},'prop');return pylon(x,z,HP);});
  for(let i=0;i<pts.length-1;i++){const [ax,az]=pts[i],[bx,bz]=pts[i+1];
    for(const [off,y] of [[-6.5,22],[6.5,22],[-6.5,26],[6.5,26]]){
      const ang=Math.atan2(bz-az,bx-ax),ox=-Math.sin(ang)*off,oz=Math.cos(ang)*off;
      const p0=[ax+ox,tops[i]+y,az+oz],p1=[bx+ox,tops[i+1]+y,bz+oz],m=[(p0[0]+p1[0])/2,(p0[1]+p1[1])/2-4,(p0[2]+p1[2])/2];
      beamW(p0,m,0.06,0.06,COL.dark,{nc:true});beamW(m,p1,0.06,0.06,COL.dark,{nc:true});}}
  push(-168,0,-182,0);const g=H(-168,-182);F.oy=g;box(0,0,0,18,0.3,12,COL.con);for(let i=0;i<3;i++){box(-6+i*6,0.3,0,3,3.2,2.4,COL.steel);box(-6+i*6,3.5,0,0.4,2,0.4,COL.white,{nc:true});}pop();
}

// ================= CIVIC PAVILIONS WITH INTERIORS =================
const CIVIC=[];
function shell(L,D,Hh,ops,col){ // single-storey envelope in current frame
  slabR(-L/2,L/2,-D/2,D/2,0,0.4,[],COL.conL);
  for(const s of [-1,1]){wallRun(-L/2+0.3,L/2-0.3,s*(D/2-0.15),0.3,0,Hh,(ops[s>0?'n':'s']||[]),col);wallRunZ(-D/2,D/2,s*(L/2-0.15),0.3,0,Hh,(ops[s>0?'e':'w']||[]),col);}
  box(0,Hh,0,L+0.6,0.4,D+0.6,COL.conD);box(0,Hh+0.4,D/2,L+0.6,0.6,0.25,COL.con);box(0,Hh+0.4,-D/2,L+0.6,0.6,0.25,COL.con);
  roofLadder(L/2-3,-D/2-0.6,Hh+0.4);
}
const ribbon=(L,sill,top,w,skip)=>{const o=[];for(let x=-L/2+1.5;x<L/2;x+=3)if(!(skip&&skip(x)))o.push({x,w:w||2.4,sill,top});return o;};
function canteen(){
  const L=30,D=18,Hh=4.5;
  shell(L,D,Hh,{n:ribbon(L,0.9,3.6).concat([{x:-9,w:2.4,sill:0,top:2.8}]).filter(o=>Math.abs(o.x+9)>1.6||o.sill===0),s:ribbon(L,1.4,3.4,1.6),e:[{x:4,w:1.2,sill:0,top:2.2}],w:ribbon(D,0.9,3.6)},COL.conL);
  wallRunZ(-D/2+0.3,D/2-0.3,6,0.2,0,Hh,[{x:-4,w:1,sill:0,top:2.1},{x:3,w:3.4,sill:0.95,top:2.1}],COL.white);
  box(4.7,0,3,1.2,0.95,6,COL.steel);
  for(let i=0;i<4;i++)furn('stove',8+i*1.6,-7.6,0,0);furn('counter',10,7.6,0,PI);furn('sink',13,7.6,0,PI);
  for(let i=0;i<4;i++)for(let j=0;j<3;j++){const tx=-12+i*4.4,tz=-4.5+j*4.5;if(chance(0.85))furn('table',tx,tz,0,0);for(const [dx,dz,a] of [[-0.5,-0.7,0],[0.5,-0.7,0],[-0.5,0.7,PI],[0.5,0.7,PI]])if(chance(0.7))furn('chair',tx+dx+rnd(-0.2,0.2),tz+dz,0,a+rnd(-0.5,0.5));}
  for(let x=-12;x<=3;x+=5)box(x,Hh-0.15,0,1.2,0.1,0.25,COL.white,{nc:true});
  box(-9,Hh+1.1,D/2+0.15,10,0.8,0.1,COL.red,{nc:true});entrance(-9,D/2,0,1,2.6);entrance(L/2,4,1,0,1.4);
  trash(-14,5,-8,8,0,10);box(10,Hh+0.4,-4,2,1.4,2,COL.steel);
}
function pool(){
  const L=42,D=26,Hh=9;
  slabR(-L/2,L/2,-D/2,D/2,0,0.4,[{x0:-12.5,x1:12.5,z0:-6,z1:6}],COL.white);
  for(const [a,b,c,d] of [[0,-0.4,-D/2+3.5,7],[0,-0.4,D/2-3.5,7]])box(a,-2.6,c,L,2.2,d,COL.conD,{nc:true});
  for(const s of [-1,1]){box(s*16.75,-2.6,0,8.5,2.2,12,COL.conD,{nc:true});}
  slabR(-12.5,12.5,-6,6,-2.2,0.4,[],COL.teal);
  for(const s of [-1,1]){box(0,-2.2,s*6.1,25,2.2,0.2,COL.teal);box(s*12.6,-2.2,0,0.2,2.2,12.4,COL.teal);}
  for(let x=-11;x<=11;x+=2.75)box(x,-2.18,0,0.2,0.01,11.8,COL.mosaicB,{nc:true});
  for(const s of [-1,1])flight(s*11.2,-5.2,-2.2,s*11.2,-3.2,0,0.8,COL.steel,true);
  box(-14,0,0,3,0.6,1,COL.conL);box(-12.4,0.6,0,4,0.12,0.7,COL.white,{nc:true});
  waterL(-12.5,-6,-6,-1,-1.9);
  for(let r=0;r<4;r++)box(0,0,D/2-1.1-r*0.9,L-4,0.45*(r+1),0.9,COL.conL);
  for(const s of [-1,1]){const o=[];for(let x=-L/2+3;x<L/2;x+=6)o.push({x,w:5,sill:1,top:Hh-0.8});wallRun(-L/2+0.3,L/2-0.3,s*(D/2-0.15),0.3,0,Hh,s<0?o.concat([{x:0,w:2.4,sill:0,top:3}]):o,COL.conL);
    wallRunZ(-D/2,D/2,s*(L/2-0.15),0.3,0,Hh,[{x:0,w:12,sill:1,top:Hh-0.8}],COL.conL);}
  for(let x=-L/2+3;x<L/2;x+=6)box(x,Hh,0,0.6,1,D,COL.con,{nc:true});
  for(let x=-L/2;x<L/2;x+=6){if(chance(0.2))continue;box(x+3,Hh+1,0,6,0.25,D,chance(0.25)?COL.glass:COL.conD);}
  roofLadder(L/2-2,D/2+0.4,Hh+1.25);
  // changing rooms annex
  push(0,0,-D/2-6,0);slabR(-12,12,-6,6,0,0.3,[],COL.white);
  for(const s of [-1,1]){wallRun(-12,12,s*5.85,0.3,0,3.2,s>0?[{x:-6,w:1,sill:0,top:2.1},{x:6,w:1,sill:0,top:2.1}]:[{x:0,w:1.4,sill:0,top:2.2}].concat(ribbon(24,1.8,2.6,1.2).filter(o=>Math.abs(o.x)>2)),COL.white);wallRunZ(-6,6,s*11.85,0.3,0,3.2,[],COL.white);}
  wallRunZ(-5.7,5.7,0,0.15,0,3.2,[{x:-3,w:1,sill:0,top:2.1}],COL.teal);
  for(let x=-11;x<=-1.5;x+=1)box(x+0.5,0,5.4,0.9,1.9,0.5,COL.blue);for(let x=1.5;x<=11;x+=1)box(x+0.5,0,5.4,0.9,1.9,0.5,COL.red);
  box(0,3.2,0,24.6,0.3,12.6,COL.conD);entrance(0,-6,0,-1,1.8);pop();
  rubble(rnd(-8,8),-2.2,rnd(-3,3),2.5,6,COL.white);
}
function boiler(){
  const L=21,D=12,Hh=8;
  shell(L,D,Hh,{n:ribbon(L,2.5,6.5,1.8).concat([{x:-6,w:3.5,sill:0,top:3.6}]),s:ribbon(L,2.5,6.5,1.8),e:[{x:2,w:1,sill:0,top:2.2}]},COL.brick);
  for(let i=0;i<3;i++){const x=-6+i*6;cyl(x,0,-1.5,1.6,1.6,4.2,10,COL.rust,{coll:true});beamL([x,4.2,-1.5],[x,Hh-0.5,-1.5],0.4,0.4,COL.steel,{nc:true});box(x,0,1.4,1,1.2,1,COL.steel);}
  box(0,5.6,-3.6,L-2,0.5,0.5,COL.steel,{nc:true});box(0,6.4,-3.6,L-2,0.4,0.4,COL.white,{nc:true});
  box(8,0,2,3,0.9,1.4,COL.green);
  push(L/2+4,0,-2,0);box(0,-0.5,0,4,1.5,4,COL.conD);cyl(0,1,0,1.7,1.1,44,10,COL.brick,{coll:true});cyl(0,44,0,1.25,1.25,1.2,10,COL.dark,{open:true});LADDERS.length;pop();
  entrance(-6,D/2,0,1,3.7);entrance(L/2,2,1,0,1.4);rubble(-L/2-5,0,4,3.5,14,COL.dark);
}
function cinema(){
  const W=30,D=36;
  slabR(-W/2,W/2,-D/2,D/2-10,0,0.4,[],COL.wood);
  for(const s of [-1,1])wallRunZ(-D/2,D/2-10,s*(W/2-0.25),0.5,0,13,[{x:-D/2+3,w:1.6,sill:0,top:2.4}],COL.con);
  wallRun(-W/2,W/2,-D/2+0.25,0.5,0,13,[],COL.con);
  for(let i=0;i<12;i++){box(0,0,-D/2+7+i*1.6,W-1,0.4+i*0.45,1.6,COL.wood);for(let x=-12;x<=12;x+=1.1)if(chance(0.8))box(x,0.4+i*0.45,-D/2+7+i*1.6-0.3,0.55,0.45,0.5,COL.red,{nc:true});}
  box(0,1.5,-D/2+0.6,W-3,7,0.1,COL.white,{nc:true});box(0,0,-D/2+4,W-1,1,3,COL.wood);
  box(0,12.4,0-5,W,0.6,D-10,COL.conD);roofLadder(W/2+0.4,-D/2+6,13);entrance(W/2,-D/2+3,1,0,1.8);entrance(-W/2,-D/2+3,-1,0,1.8);entrance(0,D/2,0,1,6);
  box(0,7.5,D/2-11.5,8,3,3,COL.conD);
  // foyer
  push(0,0,D/2-5,0);slabR(-W/2,W/2,-5,5,0,0.4,[],COL.conL);
  wallRun(-W/2,W/2,4.9,0.2,0,7,[-12,-6,0,6,12].map(x=>({x,w:5,sill:0,top:6.4})),COL.glass);
  for(const s of [-1,1])wallRunZ(-5,5,s*(W/2-0.15),0.3,0,7,[],COL.con);
  wallRun(-W/2,W/2,-5,0.3,0,7,[{x:-8,w:2,sill:0,top:2.6},{x:8,w:2,sill:0,top:2.6}],COL.con);
  box(0,7,0,W+0.6,1.2,10.6,COL.con);furn('counterL',-9,-3,0,0);
  for(let i=0;i<5;i++)box(-10+i*5,7.2,5.32,4,4,0.12,[COL.red,COL.ochre,COL.mosaicB,COL.white,COL.red][i],{nc:true,flat:true});
  pop();
}
function officePavilion(kind){
  corridorBlock({x:0,z:0,ry:0,len:30,depth:15,floors:2,y0:0,reserve:false,detail:3,furnish:'office',cores:[11],doors:[{side:-1,x:-6,w:2.4,top:2.6}],wall:kind==='mil'?COL.blue:COL.conL,paint:COL.teal,
    perFloor:(f,y)=>{if(f===0&&kind==='post'){furn('counterL',-8,-4,0,0);furn('counterL',-3.8,-4,0,0);box(-6,0.9,-4.4,8,1.2,0.05,COL.glass,{nc:true});}
      if(f===0&&kind==='mil'){for(let i=0;i<3;i++){const cx=-12+i*3.2;for(let b=0;b<14;b++)box(cx-1.4+b*0.2,0,-1.6,0.04,2.6,0.04,COL.steel,{nc:true});solidL(cx,0,-1.6,2.8,2.6,0.1);box(cx,0,-5.5,2,0.45,0.8,COL.wood);}}}});
  box(-6,3.4,-8.2,10,0.7,0.12,kind==='mil'?COL.blue:COL.red,{nc:true});entrance(-6,-7.5,0,-1,2.8);
}
function kindergarten(){const L=40,D=16,Hh=3.6;
  shell(L,D,Hh,{n:ribbon(L,0.8,2.6).filter(o=>Math.abs(o.x+12)>1.6).concat([{x:-12,w:1.6,sill:0,top:2.4}]),s:ribbon(L,0.8,2.6),e:ribbon(D,0.8,2.6),w:ribbon(D,0.8,2.6)},COL.white);
  wallRunZ(-D/2+0.3,D/2-0.3,0,0.15,0,Hh,[{x:0,w:1,sill:0,top:2.1}],COL.white);
  for(let i=0;i<3;i++)for(let j=0;j<2;j++){const tx=-15+i*5,tz=-3+j*5;if(chance(0.85))furn('table',tx,tz,0,0);for(const [dx,dz] of [[-0.5,-0.6],[0.5,-0.6],[-0.5,0.6],[0.5,0.6]])if(chance(0.7))box(tx+dx,0,tz+dz,0.32,0.3,0.32,pick([COL.red,COL.yellow,COL.blue]),{nc:true});}
  for(let i=0;i<5;i++)for(let j=0;j<2;j++)if(chance(0.85))box(4+i*3,0,-4+j*7,0.7,0.35,1.4,COL.wood,{});
  box(-12,Hh+0.4,D/2+0.15,7,0.6,0.08,COL.blue,{nc:true});entrance(-12,D/2,0,1,2.4);
  push(0,0,D/2+7,0);box(0,2.4,0,10,0.2,5,COL.conL,{});for(const x of [-4.8,4.8])for(const z of [-2.3,2.3])box(x,0,z,0.2,2.4,0.2,COL.white,{});box(0,0,-2.4,10,1.0,0.12,COL.green,{});pop();}
function foodShop(){const L=24,D=14,Hh=4.2;
  shell(L,D,Hh,{n:[{x:-7,w:5,sill:0.5,top:3.4},{x:7,w:5,sill:0.5,top:3.4},{x:0,w:2.2,sill:0,top:2.8}],s:[{x:6,w:1.2,sill:0,top:2.2}],e:ribbon(D,1.6,3.2),w:[]},COL.conL);
  furn('counter',-4,-2,0,0);furn('counter',3,-2,0,0);for(let x=-10;x<=8;x+=3.2)box(x,0,-D/2+0.7,2.8,2.2,0.5,COL.wood,{});
  for(let i=0;i<6;i++)if(chance(0.6))box(rnd(-9,9),0,rnd(1,5),rnd(0.5,0.9),rnd(0.3,0.6),rnd(0.4,0.7),COL.wood,{});
  box(0,Hh+0.45,D/2+0.12,10,0.8,0.1,COL.red,{nc:true});entrance(0,D/2,0,1,2.8);}
const CIV_TYPES={kinder:[40,16,'Kindergarten','Detsky sad: group rooms, little beds and a play veranda',kindergarten],shop:[24,14,'Food shop','Produkty: counters, empty shelves',foodShop],canteen:[30,18,'Canteen','Stolovaya: dining hall and kitchen',canteen],pool:[42,40,'Swimming pool','Drained tiled pool, stands and changing rooms',pool],
  boiler:[30,14,'Boiler house','Boilers, pipes and a 45 m brick chimney',boiler],cinema:[30,36,'Cinema','Raked auditorium and glass foyer',cinema],
  post:[30,15,'Post office','Counter hall and offices',()=>officePavilion('post')],mil:[30,15,'Militsiya station','Offices and holding cells',()=>officePavilion('mil')]};
function civicFill(list){
  const want=list||[['pool',[-190,190,205,365]],['cinema',[-190,190,-200,195]],['canteen',[-560,-330,-440,560]],['canteen',[-140,430,-460,-210]],['canteen',[200,440,395,560]],
    ['boiler',[-560,-330,-440,60]],['boiler',[-560,-330,60,560]],['boiler',[-140,430,-460,-210]],['boiler',[-190,190,205,365]],['post',[-560,-330,-440,560]],['post',[-140,430,-460,-210]],['mil',[-190,190,-200,195]]];
  for(const [kind,r] of want){
    const [L,D,name,desc,fn]=CIV_TYPES[kind];
    for(let t=0;t<4000;t++){
      const x=rnd(r[0],r[1]),z=rnd(r[2],r[3]),ry=pick([0,HP,PI,-HP]);
      const a=footAABB(x,z,L+6,D+6,ry);if(a.x0<r[0]||a.x1>r[1]||a.z0<r[2]||a.z1>r[3])continue;
      const rh=riverHalf(z);if(Math.abs(x-riverX(z))<rh.top+30)continue;
      if(overlaps(a,3.5))continue;const gb=groundBase(x,z,L,D,ry);if(gb.top-gb.bot>5)continue;
      reserve(a,'civic');addBPad(a,gb.top-0.05,9);push(x,gb.top,z,ry,{base:gb.top});box(0,gb.bot-gb.top-2,0,L,gb.top-gb.bot+2-(kind==='pool'?2.8:0.4),D,COL.conD);fn();pop();
      const sp={kinder:[-12,11,0,-1],shop:[0,10,0,-1],pool:[0,9,0,-1],canteen:[-13,6,1,-0.4],boiler:[-8,4,1,-1],cinema:[0,14,0,-1],post:[-6,-6,1,0],mil:[-6,-6,1,0]}[kind];
      const c=Math.cos(ry),sn=Math.sin(ry),wx=x+sp[0]*c-sp[1]*sn,wz=z+sp[0]*sn+sp[1]*c,dx=sp[2]*c-sp[3]*sn,dz=sp[2]*sn+sp[3]*c;
      CIVIC.push({name,desc,x:wx,z:wz,y:gb.top,yaw:Math.atan2(dx,-dz)*180/PI});break;
    }
  }
}

// ================= ROADS =================
function compactRoads(){const R2=392,L=[];const add=(a,b,c,d,w,n)=>L.push({p:[a,b,c,d],w,n});
  add(-R2,-R2,R2,-R2,14,'Ring North');add(-R2,R2,R2,R2,14,'Ring South');add(-R2,-R2,-R2,R2,14,'Ring West');add(R2,-R2,R2,R2,14,'Ring East');
  for(const x of [-300,-160,72,210,320])add(x,-R2,x,R2,12);for(const z of [-215,110,230])add(-R2,z,R2,z,12);
  for(const x of [-230,-80,265])add(x,-R2,x,R2,10);for(const z of [170,300])add(-R2,z,R2,z,10);
  add(-R2,-320,72,-320,10);add(210,-320,R2,-320,10);add(-R2,-150,-160,-150,10);add(210,-150,R2,-150,10);
  return L;}
const ROADS=CMPT?compactRoads():[
  // arterials
  {p:[-560,100,400,100],w:14,n:'Prospekt'},{p:[-560,-260,400,-260],w:14,n:'North Avenue'},
  {p:[-200,-400,-200,560],w:14},{p:[200,-460,200,560],w:14},{p:[-440,-430,-440,560],w:14},{p:[-90,-410,-90,190],w:14},
  {p:[-200,-205,200,-205],w:12},{p:[-200,200,200,200],w:12},{p:[200,200,520,200],w:12},{p:[-440,300,-200,300],w:12},
  // district streets
  {p:[-200,-380,430,-380],w:10},{p:[-560,-120,-340,-120],w:10},{p:[-560,-360,-340,-360],w:10},{p:[-560,470,-340,470],w:10},
  {p:[0,-440,0,-205],w:10},{p:[300,-440,300,-205],w:10},{p:[-150,-205,-150,200],w:10},{p:[150,-205,150,200],w:10},
  {p:[-200,290,200,290],w:10},{p:[0,200,0,395],w:10},{p:[200,-110,420,-110],w:10},{p:[380,-110,380,200],w:10},{p:[200,470,430,470],w:10},
  {p:[-560,30,-440,30],w:10},{p:[-560,200,-520,200],w:10},{p:[-150,-310,-150,-205],w:10},{p:[90,-460,90,-380],w:10},
  // access
  {p:[500,394,500,200],w:10,nf:1},{p:[-380,366,-380,300],w:10,nf:1}
];
const BRIDGE_Z=CMPT?[]:[-260,100,300];
const NS_X=()=>ROADS.filter(r=>Math.abs(r.p[0]-r.p[2])<1).map(r=>r.p[0]);
function inOtherRoad(x,z,self){for(const r of ROADS){if(r===self)continue;const [ax,az,bx,bz]=r.p,w=r.w/2+3.6;const x0=Math.min(ax,bx)-w,x1=Math.max(ax,bx)+w,z0=Math.min(az,bz)-w,z1=Math.max(az,bz)+w;
  if(Math.abs(ax-bx)>1&&Math.abs(az-bz)>1)continue;if(x>x0&&x<x1&&z>z0&&z<z1)return true;}return false;}
function reserveRoads(){
  for(const RD of ROADS){const [ax,az,bx,bz]=RD.p,w=RD.w,L=Math.hypot(bx-ax,bz-az);
    if(Math.abs(ax-bx)<1||Math.abs(az-bz)<1)reserve({x0:Math.min(ax,bx)-w/2-3,x1:Math.max(ax,bx)+w/2+3,z0:Math.min(az,bz)-w/2-3,z1:Math.max(az,bz)+w/2+3},'road');
    else for(let t=0;t<1;t+=8/L){const x=lerp(ax,bx,t),z=lerp(az,bz,t);reserve({x0:x-w/2-2,x1:x+w/2+2,z0:z-w/2-2,z1:z+w/2+2},'road');}}
}
const landS=(x,z)=>baseH(x,z,true);
const inRiver=(x,z,m)=>z>RIV0&&Math.abs(x-riverX(z))<riverHalf(z).top+(m||0);
let HWP=null;
function computeRoadProfiles(){
  const G=0.06;
  const nodes=new Map(),getN=(x,z)=>{const k=Math.round(x)+','+Math.round(z);let n=nodes.get(k);if(!n){n={x,z,h:0};nodes.set(k,n);}return n;};
  for(const r of ROADS){const [ax,az,bx,bz]=r.p;r.L=Math.hypot(bx-ax,bz-az);r.ux=(bx-ax)/r.L;r.uz=(bz-az)/r.L;r.nl=[{t:0,n:getN(ax,az)},{t:r.L,n:getN(bx,bz)}];}
  for(let i=0;i<ROADS.length;i++)for(let j=i+1;j<ROADS.length;j++){const A=ROADS[i],B=ROADS[j];
    const den=A.ux*B.uz-A.uz*B.ux;if(Math.abs(den)<1e-6)continue;
    const dx=B.p[0]-A.p[0],dz=B.p[1]-A.p[1],ta=(dx*B.uz-dz*B.ux)/den,tb=(dx*A.uz-dz*A.ux)/den;
    if(ta<-1||ta>A.L+1||tb<-1||tb>B.L+1)continue;
    const n=getN(A.p[0]+A.ux*ta,A.p[1]+A.uz*ta);A.nl.push({t:clamp(ta,0,A.L),n});B.nl.push({t:clamp(tb,0,B.L),n});}
  for(const [x,z] of [[400,-260],[-440,-430]])for(const r of ROADS){const t=(x-r.p[0])*r.ux+(z-r.p[1])*r.uz;if(t<0||t>r.L)continue;if(Math.abs(-(x-r.p[0])*r.uz+(z-r.p[1])*r.ux)<r.w/2)r.nl.push({t,n:getN(x,z)});}
  for(const n of nodes.values()){let s=0,c=0;for(let a=0;a<6;a++){const x=n.x+Math.cos(a)*22,z=n.z+Math.sin(a)*22;if(inRiver(x,z,2))continue;s+=landS(x,z);c++;}n.h=c?s/c:landS(n.x,n.z);}
  const edges=[];
  for(const r of ROADS){r.nl.sort((a,b)=>a.t-b.t);const u=[];for(const e of r.nl)if(!u.length||e.t-u[u.length-1].t>1)u.push(e);r.nl=u;for(let i=0;i<u.length-1;i++)edges.push([u[i].n,u[i+1].n,u[i+1].t-u[i].t]);}
  for(let it=0;it<500;it++)for(const [a,b,d] of edges){const df=b.h-a.h,lim=G*Math.max(0,d-28)*0.9;if(Math.abs(df)>lim){const ex=(Math.abs(df)-lim)/2*Math.sign(df);a.h+=ex;b.h-=ex;}}
  for(const r of ROADS){
    const N=Math.max(2,Math.ceil(r.L/5)+1),st=r.L/(N-1),raw=new Float32Array(N),ys=new Float32Array(N),fx=new Uint8Array(N);
    for(let i=0;i<N;i++){const x=r.p[0]+r.ux*st*i,z=r.p[1]+r.uz*st*i;raw[i]=landS(x,z);}
    for(let i=0;i<N;i++){let s=0,c=0;for(let k=-8;k<=8;k++){const j=i+k;if(j<0||j>=N)continue;s+=raw[j];c++;}ys[i]=s/c;}
    for(const e of r.nl){for(let i=0;i<N;i++)if(Math.abs(i*st-e.t)<=13){ys[i]=e.n.h;fx[i]=1;}}
    const d=G*st;
    for(let it=0;it<80;it++){for(let i=1;i<N;i++)if(!fx[i])ys[i]=clamp(ys[i],ys[i-1]-d,ys[i-1]+d);for(let i=N-2;i>=0;i--)if(!fx[i])ys[i]=clamp(ys[i],ys[i+1]-d,ys[i+1]+d);}
    const tun=new Uint8Array(N);
    for(let i=0;i<N;i++){const x=r.p[0]+r.ux*st*i,z=r.p[1]+r.uz*st*i;if(!inRiver(x,z,6)&&raw[i]-ys[i]>=7.5&&!r.nl.some(e=>Math.abs(e.t-i*st)<28))tun[i]=1;}
    for(let i=0;i<N;i++){if(tun[i])continue;let a=i-1,b=i+1;while(b<N&&!tun[b])b++;if(a>=0&&tun[a]&&b<N&&b-i<=2)for(let k=i;k<b;k++)tun[k]=1;}
    for(let i=0;i<N;){if(!tun[i]){i++;continue;}let j=i;while(j<N&&tun[j])j++;if(j-i<5)for(let k=i;k<j;k++)tun[k]=0;i=j;}
    r.prof={ax:r.p[0],az:r.p[1],ux:r.ux,uz:r.uz,L:r.L,core:r.w/2+3.6,step:st,ys,tun,road:r};
    RPROF.push(r.prof);
  }
  // highway profile (elevated, 4%)
  {const N=201,st=10,raw=new Float32Array(N),ys=new Float32Array(N),tun=new Uint8Array(N);
   for(let i=0;i<N;i++)raw[i]=landS(-1000+i*st,HWZ);
   for(let i=0;i<N;i++){let m=-1e9;for(let k=-6;k<=6;k++){const j=i+k;if(j>=0&&j<N)m=Math.max(m,raw[j]*0.5+raw[i]*0.5);}ys[i]=Math.max(raw[i]+8,m+6);}
   for(let it=0;it<80;it++){for(let i=1;i<N;i++)ys[i]=clamp(ys[i],ys[i-1]-0.4,ys[i-1]+0.4);for(let i=N-2;i>=0;i--)ys[i]=clamp(ys[i],ys[i+1]-0.4,ys[i+1]+0.4);}
   for(let i=0;i<N;i++)if(raw[i]-ys[i]>=6.5&&!inRiver(-1000+i*st,HWZ,6)&&Math.abs(-1000+i*st)<620)tun[i]=1;
   HWP={ax:-1000,az:HWZ,ux:1,uz:0,L:2000,core:12,step:st,ys,tun,cutOnly:true};RPROF.push(HWP);}
}
function profY(P,x,z){const t=clamp((x-P.ax)*P.ux+(z-P.az)*P.uz,0,P.L),fi=t/P.step,i=Math.min(P.ys.length-2,Math.floor(fi));return lerp(P.ys[i],P.ys[i+1],fi-i);}
function portal(x,z,y,ang,w,hh){const ux=Math.cos(ang),uz=Math.sin(ang),W=w/2;let g=y+hh+3;for(let s=-4;s<=4;s+=1)for(let off=-W-6;off<=W+6;off+=2)g=Math.max(g,baseH(x+ux*s-uz*off,z+uz*s+ux*off,true));g=Math.min(g,y+hh+14)+0.5;
  push(x,y,z,ang);for(const s of [-1,1])box(0,-0.5,s*(W+3),1.6,g-y+0.5,6,COL.con);box(0,hh,0,1.6,g-y-hh,w+12,COL.con);box(0.85,hh+1,0,0.1,1,w*0.6,COL.yellow,{nc:true});pop();
  addHole(x,z,ux,uz,3.2,W+0.8);}
function buildRoads(){
  for(const RD of ROADS){
    const P=RD.prof,w=RD.w,N=P.ys.length,st=P.step,ang=Math.atan2(P.uz,P.ux);
    const lift=w>=14?0.14:w>=12?0.12:0.1;
    const X=i=>P.ax+P.ux*st*i,Z=i=>P.az+P.uz*st*i;
    for(let i=0;i<N-1;i+=2){
      const j=Math.min(i+2,N-1),cx=(X(i)+X(j))/2,cz=(Z(i)+Z(j))/2;
      if(inRiver(cx,cz,1))continue;
      const y0=P.ys[i]+lift,y1=P.ys[j]+lift,tn=P.tun[i]||P.tun[j];
      flight(X(i),Z(i),y0,X(j),Z(j),y1,w,COL.asph,false);
      for(const s of [-1,1]){const ox=-P.uz*s*(w/2+1.5),oz=P.ux*s*(w/2+1.5);if(inOtherRoad(cx+ox,cz+oz,RD))continue;flight(X(i)+ox,Z(i)+oz,y0+0.16,X(j)+ox,Z(j)+oz,y1+0.16,3,COL.conL,false);}
      if(!inOtherRoad(cx,cz,RD)){push(cx,(y0+y1)/2,cz,ang);if(w>=14)box(0,0.005,0,st*2-2,0.02,0.6,COL.conL,{nc:true});else if(i%4===0)box(0,0.005,0,4,0.01,0.25,COL.white,{nc:true});pop();}
      if(!tn&&i%8===0&&!inOtherRoad(cx,cz,RD)){const s=i%16?1:-1;const lx=cx-P.uz*s*(w/2+2.4),lz=cz+P.ux*s*(w/2+2.4);push(lx,(y0+y1)/2+0.2,lz,ang+(s>0?HP:-HP));box(0,0,0,0.22,9,0.22,COL.steel);beamL([0,9,0],[0,9,2.2],0.1,0.1,COL.steel,{nc:true});box(0,8.8,2.2,0.4,0.2,0.8,COL.lamp,{nc:true,e:true});pop();}
      if(!tn&&chance(0.03)&&!inOtherRoad(cx,cz,RD)){const s=chance(0.5)?1:-1;rnd(-0.05,0.05);keepSeq3();}
    }
    // tunnels
    for(let i=0;i<N;){if(!P.tun[i]){i++;continue;}let j=i;while(j<N&&P.tun[j])j++;
      const a=i,b=Math.max(i+1,j-1);
      for(let k=a;k<b;k+=4){const e=Math.min(k+4,b);tube(X(k),Z(k),P.ys[k],X(e),Z(e),P.ys[e],w+6,6.5,{noFloor:true,lamp:12,wallC:COL.conD});}
      portal(X(a),Z(a),P.ys[a],ang,w+6,6.5);portal(X(b),Z(b),P.ys[b],ang,w+6,6.5);
      ROAD_TUNNELS.push([X(Math.floor((a+b)/2)),P.ys[Math.floor((a+b)/2)],Z(Math.floor((a+b)/2)),ang]);
      i=j;}
  }
}
const ROAD_TUNNELS=[];
// ---------- spiral road tunnels ----------
function helix(cx,cz,r,y0,y1,a0,aEnd,dir,w){
  const G=0.075,circ=2*PI*r;let base=((aEnd-a0)*dir)%(2*PI);if(base<0)base+=2*PI;
  let k=0;while((base+2*PI*k)*r*G<(y1-y0))k++;
  const total=dir*(base+2*PI*k),n=Math.ceil(Math.abs(total)/(PI/18));
  helix._prev=null;
  for(let i=0;i<n;i++){const a=a0+total*i/n,b=a0+total*(i+1)/n,ya=lerp(y0,y1,i/n),yb=lerp(y0,y1,(i+1)/n);
    const p=[cx+r*Math.cos(a),cz+r*Math.sin(a)],q=[cx+r*Math.cos(b),cz+r*Math.sin(b)];
    flight(p[0],p[1],ya,q[0],q[1],yb,w,COL.asph,false);
    const cv=Math.min(baseH(p[0],p[1],true),baseH(q[0],q[1],true))-Math.max(ya,yb),enc=cv>=7.5||(k>0&&i<n-Math.ceil(n/(k+1))&&cv>-2);
    if(i>0&&enc!==helix._prev)portal(p[0],p[1],ya,Math.atan2(q[1]-p[1],q[0]-p[0]),w+4,6.2);helix._prev=enc;
    if(enc)tube(p[0],p[1],ya,q[0],q[1],yb,w+4,6.2,{noFloor:true,lamp:i%3===0?4:0,wallC:COL.conD});
    else{const hw=w/2+2.5,ux=(q[0]-p[0]),uz=(q[1]-p[1]),LL=Math.hypot(ux,uz);CUTS.push({x0:Math.min(p[0],q[0])-hw,x1:Math.max(p[0],q[0])+hw,z0:Math.min(p[1],q[1])-hw,z1:Math.max(p[1],q[1])+hw,fn:(px,pz)=>{const t=((px-p[0])*ux+(pz-p[1])*uz)/LL/LL;if(t<-0.2||t>1.2)return 1e9;if(Math.abs(-(px-p[0])*uz+(pz-p[1])*ux)/LL>hw)return 1e9;return lerp(ya,yb,clamp(t,0,1))-0.08;}});
      for(const s of [-1,1])box((p[0]+q[0])/2-uz/LL*s*hw,Math.min(ya,yb)-0.5,(p[1]+q[1])/2+ux/LL*s*hw,Math.abs(q[0]-p[0])+0.6,Math.max(1.5,cv+2),Math.abs(q[1]-p[1])+0.6,COL.con);}}
  return {turns:k};
}
function straightRoad(ax,az,ya,bx,bz,yb,w,o){
  o=o||{};const L=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.ceil(L/10));
  for(let i=0;i<n;i++){const t0=i/n,t1=(i+1)/n;flight(lerp(ax,bx,t0),lerp(az,bz,t0),lerp(ya,yb,t0),lerp(ax,bx,t1),lerp(az,bz,t1),lerp(ya,yb,t1),w,COL.asph,false);}
  const m=Math.max(1,Math.ceil(L/10)),ux=(bx-ax)/L,uz=(bz-az)/L;
  for(let i=0;i<m;i++){const t0=i/m,t1=(i+1)/m,x0=lerp(ax,bx,t0),z0=lerp(az,bz,t0),x1=lerp(ax,bx,t1),z1=lerp(az,bz,t1),y0=lerp(ya,yb,t0),y1=lerp(ya,yb,t1);
    const cover=Math.min(baseH(x0,z0,true),baseH(x1,z1,true))-Math.max(y0,y1);
    const enc=o.tunnel&&cover>=7.5&&!(o.skip&&Math.hypot(x0-ax,z0-az)<o.skip);if(o._st!==undefined&&enc!==o._st)portal(x0,z0,y0,Math.atan2(uz,ux),w+4,6.2);else if(o._st===undefined&&enc)portal(x0,z0,y0,Math.atan2(uz,ux),w+4,6.2);o._st=enc;
    if(enc){tube(x0,z0,y0,x1,z1,y1,w+4,6.2,{noFloor:true,lamp:10,wallC:COL.conD});}
    else{const hw=w/2+2.5;CUTS.push({x0:Math.min(x0,x1)-hw,x1:Math.max(x0,x1)+hw,z0:Math.min(z0,z1)-hw,z1:Math.max(z0,z1)+hw,fn:(px,pz)=>{const t=((px-x0)*ux+(pz-z0)*uz)/(L/m);if(t<-0.05||t>1.05||Math.abs(-(px-x0)*uz+(pz-z0)*ux)>hw)return 1e9;return lerp(y0,y1,clamp(t,0,1))-0.08;}});
      if(cover>1.5&&!(o.skip&&Math.hypot(x0-ax,z0-az)<o.skip))for(const s of [-1,1])box((x0+x1)/2-uz*s*hw,Math.min(y0,y1)-0.5,(z0+z1)/2+ux*s*hw,Math.abs(x1-x0)+0.6,Math.min(cover,8)+1.5,Math.abs(z1-z0)+0.6,COL.con);}}
}
function spiralRoads(){if(CMPT)return;
  // Dam spiral inside the north highland
  const R5=ROADS.find(r=>r.p[0]===-440&&r.p[2]===-440),yA=profY(R5.prof,-440,-430);
  const C=[-480,-472],r=26;
  straightRoad(-440,-430,yA,-454,-440,yA,10,{skip:30});
  CUTS.push({x0:-461,x1:-447,z0:-455,z1:-436,y:yA-0.08});for(const sx of [-461.6,-446.4])box(sx,yA-0.6,-445.5,1.2,15,19,COL.con);
  straightRoad(-454,-440,yA,-454,-472,yA,10,{tunnel:true,skip:14});
  helix(C[0],C[1],r,yA,40,0,PI/2,-1,10);
  straightRoad(-480,-446,40,-425,-446,40,10,{});
  CUTS.push({x0:-482,x1:-424,z0:-453,z1:-439,y:39.9});
  for(const s of [-1,1])for(let x=-480;x<-430;x+=10)box(x+5,39.9,-446+s*6,10,1.1,0.5,COL.con);
  portal(-480,-446,40,0,14,6.2);
  SPIRALS.push(['Spiral tunnel to the dam',-454,yA,-445,180,'Road helix inside the highland, climbing to the dam crest']);
  // Radio Hill spiral
  const NA=ROADS.find(r=>r.p[1]===-260&&r.p[3]===-260),yB=profY(NA.prof,400,-260);
  const D=[470,-290],r2=30,top=baseH(500,-252);
  straightRoad(400,-260,yB,400,-320,yB,10,{tunnel:true,skip:16});
  straightRoad(400,-320,yB,470,-320,yB,10,{tunnel:true});
  helix(D[0],D[1],r2,yB,top-2.5,-HP,0,1,10);
  straightRoad(500,-290,top-2.5,500,-252,top,10,{});
  CUTS.push({x0:493,x1:507,z0:-292,z1:-250,fn:(px,pz)=>lerp(top-2.5,top,clamp((pz+290)/38,0,1))-0.1});
  portal(500,-290,top-2.5,HP,14,6.2);
  SPIRALS.push(['Spiral tunnel inside Radio Hill',420,yB,-320,90,'Road helix up to the mast']);
}
const SPIRALS=[];
const BRIDGES=[];
function roadBridge(z,w){
  const rx=riverX(z),rh=riverHalf(z),bed=-riverDepth(z),half=rh.top+8;BRIDGES.push({z,rx,half,hw:w/2+2.5});
  const RD=ROADS.find(r=>r.p[1]===z&&r.p[3]===z&&Math.min(r.p[0],r.p[2])<rx&&Math.max(r.p[0],r.p[2])>rx);
  const Y=x=>RD?profY(RD.prof,x,z)+0.14:0.14;
  for(let x=rx-half;x<rx+half-0.01;x+=10){const x1=Math.min(rx+half,x+10),y0=Y(x),y1=Y(x1);
    hexa([toW(x,y0-1.6,z-w/2-2.5),toW(x1,y1-1.6,z-w/2-2.5),toW(x1,y1-1.6,z+w/2+2.5),toW(x,y0-1.6,z+w/2+2.5),toW(x,y0,z-w/2-2.5),toW(x1,y1,z-w/2-2.5),toW(x1,y1,z+w/2+2.5),toW(x,y0,z+w/2+2.5)],COL.con);
    rampW(x,z,y0,x1,z,y1,w+5);
    for(const s of [-1,1]){flight(x,z+s*(w/2+2.2),y0+1.0,x1,z+s*(w/2+2.2),y1+1.0,0.5,COL.conL,false);solidL((x+x1)/2,(y0+y1)/2,z+s*(w/2+2.2),x1-x,1.1,0.5);}
    if(Math.round((x-rx+half)/10)%3===1)for(const s of [-1,1]){const yy=(y0+y1)/2;box((x+x1)/2,yy,z+s*(w/2+2.2),0.2,8,0.2,COL.steel,{nc:true});box((x+x1)/2,yy+7.8,z+s*(w/2+1.4),0.8,0.2,0.5,COL.lamp,{nc:true,e:true});}
  }
  for(const f of [-0.45,0,0.45]){const x=rx+half*f,y=Y(x);box(x,bed,z,3,y-1.6-bed,w,COL.con);}
}
// ---------- GATE BUILDING over an avenue ----------
function gateBuilding(x,z,ry,clear){
  const off=clear/2+12,c=Math.cos(ry),sn=Math.sin(ry);
  const P=[-1,1].map(s=>[x+s*off*c,z+s*off*sn]);
  const gb=Math.max(...P.map(([px,pz])=>groundBase(px,pz,24,24,ry).top));
  for(let i=0;i<2;i++){const s=i?1:-1;PADS_FIX.push({x:P[i][0],z:P[i][1],y:gb});}
  for(let i=0;i<2;i++){const s=i?1:-1;pointTower({x:P[i][0],z:P[i][1],ry,size:24,floors:18,detail:1,damage:0.2,paint:COL.blue,num:null,doorSide:{side:s<0?3:1,floors:[13,14,15]},baseY:gb});}
  push(x,gb+39,z,ry,{base:gb});
  const L=clear+0.6;
  for(let f=0;f<4;f++){slabR(-L/2,L/2,-8,8,f*3,0.3,[],COL.conL);if(f<3)for(const sz of [-1,1])wallRun(-L/2,L/2,sz*7.85,0.3,f*3,3,(()=>{const o=[];for(let xx=-L/2+1.5;xx<L/2;xx+=3)o.push({x:xx,w:1.8,sill:0.8,top:2.4});return o;})(),COL.panel);}
  box(0,-2,0,L,2,16,COL.con);
  pop();
}
const PADS_FIX=[];
// ---------- COOLING TOWER ----------
function coolingTower(x,z){
  const g=H(x,z);reserve({x0:x-34,x1:x+34,z0:z-34,z1:z+34},'hero');
  push(x,g,z,0,{mat:1,base:g});
  const Ht=90,n=14,r=y=>{const t=(y-62)/48;return 17*Math.sqrt(1+t*t*2.4);};
  for(let i=0;i<n;i++){const y0=i*Ht/n,y1=(i+1)*Ht/n;cyl(0,y0,0,r(y0),r(y1),Ht/n,24,i%5===4?COL.conD:COL.conL,{open:true});}
  for(let i=0;i<16;i++){const a=i/16*PI*2;beamL([Math.cos(a)*r(0),0,Math.sin(a)*r(0)],[Math.cos(a+0.2)*r(0)*0.95,7,Math.sin(a+0.2)*r(0)*0.95],0.8,0.8,COL.con,{nc:true});}
  cyl(0,0.2,0,r(0)-1,r(0)-1,0.3,24,COL.wet);
  pop();
}
// ---------- FRONTAGE: buildings line every street ----------
function distOf(x,z){for(const d of DISTRICTS)if(x>d.x0&&x<d.x1&&z>d.z0&&z<d.z1)return d.n;return 'none';}
function frontage(){
  for(const RD of ROADS){
    if(RD.nf)continue;
    const [ax,az,bx,bz]=RD.p,L=Math.hypot(bx-ax,bz-az),ux=(bx-ax)/L,uz=(bz-az)/L,nx=-uz,nz=ux,ang=Math.atan2(uz,ux);
    for(const side of [1,-1]){
      let t=rnd(14,26);
      while(t<L-14){
        const px=ax+ux*t,pz=az+uz*t,dn=distOf(px+nx*side*30,pz+nz*side*30);
        if(dn==='none'){t+=20;continue;}
        const d=Math.hypot(px-T245.x,pz-T245.z),r=R();
        let k;
        if(dn==='Industrial East')k='hall';
        else if(dn==='Central')k=r<0.3?'mega':r<0.5?'t22':r<0.62?'inst':r<0.75?'atr':r<0.86?'park':'s9';
        else if(d<520)k=r<0.22?'mega':r<0.44?'s9':r<0.6?'t22':r<0.72?'t16':r<0.82?'atr':r<0.88?'park':'k5';
        else k=r<0.15?'mega':r<0.45?'s9':r<0.75?'k5':r<0.9?'t16':'shop2';
        let len,dep;
        if(k==='mega'){len=pick([120,132,144]);dep=15;}else if(k==='s9'){len=pick([60,72,84]);dep=12;}else if(k==='k5'){len=pick([48,60,72]);dep=12;}
        else if(k==='inst'){len=pick([96,120]);dep=18;}else if(k==='hall'){len=pick([48,72,96]);dep=pick([24,30,36]);}
        else if(k==='shop2'){len=pick([24,30,36]);dep=14;}else if(k==='atr'){len=34;dep=34;}else if(k==='park'){len=66;dep=36;}else{len=24;dep=24;}
        if(t+len>L-12){t+=12;continue;}
        const setb=RD.w/2+3+pick([8,10,14])+dep/2+(k==='hall'?2:0);
        const cx=ax+ux*(t+len/2)+nx*side*setb,cz=az+uz*(t+len/2)+nz*side*setb;
        const ry=side>0?ang+PI:ang;
        const a=footAABB(cx,cz,len+(k==='mega'?2:0),dep+4,ry);
        const rh=riverHalf(cz);
        let ok=Math.abs(cx)<548&&Math.abs(cz)<548&&!(cz>RIV0&&Math.abs(cx-riverX(cz))<rh.top+12+Math.max(len,dep)/2)&&!overlaps(a,3);
        if(ok){const gb=groundBase(cx,cz,len,dep,ry);if(gb.top-gb.bot>(k==='mega'?11:9))ok=false;}
        if(!ok){t+=10;continue;}
        const dm=dmgAt(cx,cz),det=chance(0.25)?1:0,paint=dn==='West Residential'?COL.teal:dn==='North Residential'?COL.green:dn==='South Edge'?COL.ochre:COL.blue;
        if(k==='mega')resSlab({x:cx,z:cz,ry,len,depth:15,floors:pick([14,16]),detail:det,sec:24,damage:dm,paint,num:BNUM++});
        else if(k==='s9')resSlab({x:cx,z:cz,ry,len,floors:pick([9,9,12]),detail:det,damage:dm,paint,num:BNUM++,shop:det>0&&chance(0.4)});
        else if(k==='k5')resSlab({x:cx,z:cz,ry,len,floors:5,detail:det,damage:dm,paint,shop:det>0&&chance(0.4)});
        else if(k==='inst')corridorBlock({x:cx,z:cz,ry,len,depth:18,floors:pick([8,10,12]),detail:0,cores:[-len/2+6,0,len/2-6].map(v=>3*Math.round(v/3)),wall:COL.conL,win:{w:2.6,sill:0.9,top:2.5},doors:[{side:1,x:0,w:4,top:3}]});
        else if(k==='hall')hall({x:cx,z:cz,ry,len,span:dep,h:pick([10,12,14,16]),roof:chance(0.5)?'saw':'flat',catwalk:false,machines:1});
        else if(k==='atr'){atriumBlock({x:cx,z:cz,ry,size:34,floors:pick([9,12,14])});XTRA.push(['Atrium block',cx,null,cz,0,'Hollow-core block with gallery rings']);}
        else if(k==='park'){garage({x:cx,z:cz,ry,len:66,depth:36,levels:pick([3,4,5])});XTRA.push(['Parking garage',cx,null,cz,0,'Open concrete decks and ramps']);}
        else if(k==='shop2')resSlab({x:cx,z:cz,ry,len,depth:14,floors:2,detail:0,paint:COL.blue,shop:false});
        else pointTower({x:cx,z:cz,ry,size:24,floors:k==='t22'?pick([22,24,26]):16,detail:det,damage:dm,paint,num:BNUM++});
        t+=len+pick([8,12,16,24]);
      }
    }
  }
}
function kvartal(rect,n){
  let c=0;for(let t=0;t<800&&c<n;t++){const x=rnd(rect.x0,rect.x1),z=rnd(rect.z0,rect.z1),ry=pick([0,HP])+rnd(-0.1,0.1),S=96;
    const a=footAABB(x,z,S+4,S+4,ry);if(a.x0<rect.x0||a.x1>rect.x1||a.z0<rect.z0||a.z1>rect.z1||overlaps(a,6))continue;
    const rh=riverHalf(z);if(Math.abs(x-riverX(z))<rh.top+80)continue;const gb=groundBase(x,z,S,S,ry);if(gb.top-gb.bot>10)continue;
    reserve(a,'kv');const fl=pick([5,9,9]),cr=Math.cos(ry),sr=Math.sin(ry);
    for(let i=0;i<4;i++){const a2=ry+i*HP,lx=0,lz=S/2-6;const wx=x+(lx*Math.cos(a2)-lz*Math.sin(a2)),wz=z+(lx*Math.sin(a2)+lz*Math.cos(a2));
      resSlab({x:wx,z:wz,ry:a2,len:i%2?72:96,floors:fl,detail:chance(0.2)?1:0,damage:dmgAt(x,z),paint:COL.teal,baseY:gb.top});FOOT.pop();}
    c++;}
}
// ================= DISTRICTS =================
const DISTRICTS=[
  {n:'Central',x0:-190,x1:190,z0:-200,z1:195},
  {n:'North Residential',x0:-140,x1:430,z0:-460,z1:-210},
  {n:'West Residential',x0:-560,x1:-330,z0:-440,z1:560},
  {n:'Industrial East',x0:210,x1:560,z0:-250,z1:365},
  {n:'South Edge',x0:-190,x1:195,z0:205,z1:560},
  {n:'South Edge',x0:205,x1:440,z0:395,z1:560},
  {n:'North Residential',x0:-140,x1:295,z0:-555,z1:-460},
];
function districtAt(x,z){
  if(z<RIV0+20&&x<-130&&x>-470)return 'River and Dam';
  if(Math.abs(x-riverX(z))<riverHalf(z).top+4&&z>RIV0)return 'River and Dam';
  for(const d of DISTRICTS)if(x>d.x0&&x<d.x1&&z>d.z0&&z<d.z1)return d.n;
  if(Math.hypot(x-470,z+290)<110)return 'Radio Hill';
  return 'Forest';
}
function cellName(x,z){const c=Math.floor((x+560)/140),r=Math.floor((z+560)/140);if(c<0||c>7||r<0||r>7)return 'outside';return 'ABCDEFGH'[c]+(r+1);}
const dmgAt=(x,z)=>clamp(1-Math.abs((x-T245.x)+(z-T245.z))/Math.SQRT2/170,0,1)*0.85+0.08;
let BNUM=1;const FR={edge:0,river:0,ov:0,slope:0};
function fillRes(rect,count,paint){
  let placed=0;
  const st=7,nx=Math.ceil((rect.x1-rect.x0)/st),nz=Math.ceil((rect.z1-rect.z0)/st),maxT=rect.scan?nx*nz*3:9000;
  for(let t=0;t<maxT&&placed<count;t++){
    const idx=t%(nx*nz),x=rect.scan?rect.x0+(idx%nx)*st+rnd(-1.5,1.5):rnd(rect.x0,rect.x1),z=rect.scan?rect.z0+Math.floor(idx/nx)*st+rnd(-1.5,1.5):rnd(rect.z0,rect.z1);
    const d=Math.hypot(x-T245.x,z-T245.z);
    const r=R();let type;
    if(d>460)type=r<0.45?'k5':r<0.75?'s9':r<0.85?'t16':r<0.93?'mega':'frame';
    else if(d>270)type=r<0.2?'k5':r<0.55?'s9':r<0.75?'t16':r<0.88?'mega':r<0.95?'t22':'frame';
    else type=r<0.3?'s9':r<0.52?'t22':r<0.7?'mega':r<0.8?'atr':r<0.88?'park':'g12';
    if(d>270&&d<460&&R()<0.12)type=pick(['atr','park']);
    if(rect.types)type=pick(rect.types);
    let w,dd,ry=pick([0,HP]);if(chance(0.18)&&!rect.tight)ry+=rnd(-0.3,0.3);
    let len=0;
    if(type==='k5'){len=pick([48,60,72]);w=len;dd=14;}
    else if(type==='s9'){len=pick([60,72,84]);w=len;dd=14;}
    else if(type==='s14'){len=pick([60,72]);w=len;dd=14;}
    else if(type==='g12'){len=pick([84,96]);w=len;dd=18;}
    else if(type==='t16'||type==='t22'){w=26;dd=26;}
    else if(type==='mega'){len=pick([120,132,144]);w=len;dd=17;}
    else if(type==='atr'){w=36;dd=36;}else if(type==='park'){w=68;dd=38;}
    else {w=26;dd=14;}
    const a=footAABB(x,z,w,dd,ry);
    if(a.x0<rect.x0||a.x1>rect.x1||a.z0<rect.z0||a.z1>rect.z1){FR.edge++;continue;}
    const rh=riverHalf(z);if(Math.abs(x-riverX(z))-Math.max(w,dd)/2<rh.top+10){FR.river++;continue;}
    if(overlaps(a,rect.tight?(CMPT?8:3):(type==='t16'||type==='t22'?5.5:4))){FR.ov++;continue;}
    {const gb=groundBase(x,z,w,dd,ry);if(gb.top-gb.bot>9){FR.slope++;continue;}}
    const dm=dmgAt(x,z),rr=R(),det=rr<0.05?2:rr<0.3?1:0,shop=det>=1&&chance(0.35);
    if(type==='mega'){resSlab({x,z,ry,len,depth:15,floors:pick([14,16]),detail:det,sec:24,damage:dm,paint,num:BNUM++});placed++;continue;}
    if(type==='atr'){atriumBlock({x,z,ry,size:34,floors:pick([9,12,14])});XTRA.push(['Atrium block',x,null,z,0,'Hollow-core block with gallery rings']);placed++;continue;}
    if(type==='park'){garage({x,z,ry,len:66,depth:36,levels:pick([3,4,5])});XTRA.push(['Parking garage',x,null,z,0,'Open concrete decks and ramps']);placed++;continue;}
    if(type==='t22'){pointTower({x,z,ry,size:24,floors:CMPT?pick([22,26,30]):pick([22,24,26]),detail:det,damage:dm,paint,num:BNUM++,hole:dm>0.35&&chance(0.45)?[10,15]:null});placed++;continue;}
    if(type==='k5')resSlab({x,z,ry,len,floors:5,detail:det,damage:dm,paint,shop});
    else if(type==='s9')resSlab({x,z,ry,len,floors:9,detail:det,damage:dm,paint,num:BNUM++,shop});
    else if(type==='s14')resSlab({x,z,ry,len,floors:pick([12,14,16]),depth:14,detail:det,sec:24,damage:dm,paint,num:BNUM++,shop});
    else if(type==='g12')resSlab({x,z,ry,len,floors:12,detail:det,damage:dm,paint,gallery:true,num:BNUM++});
    else if(type==='t16')pointTower({x,z,ry,size:24,floors:CMPT?pick([16,18,20]):16,detail:chance(0.4)?2:det,damage:dm,paint,num:BNUM++,hole:dm>0.4&&chance(0.4)?[7,11]:null});
    else frameBld({x,z,ry,nx:4,nz:2,floors:Math.floor(rnd(4,11))});
    placed++;
  }
  return placed;
}
function props(rect,n){
  for(let t=0;t<n*8;t++){
    const x=rnd(rect.x0,rect.x1),z=rnd(rect.z0,rect.z1),ry=pick([0,HP])+(chance(0.3)?rnd(-0.4,0.4):0);
    const kind=pick(['gar','gar','kiosk','play','trans','trans','sub','bench']);
    const dims={gar:[rnd(24,48),7],kiosk:[3.5,3.5],play:[16,12],trans:[5,4],sub:[10,7],bench:[3,1]}[kind];
    const a=footAABB(x,z,dims[0],dims[1],ry);
    const rh=riverHalf(z);if(Math.abs(x-riverX(z))<rh.top+6)continue;
    if(overlaps(a,3))continue;
    if(CMPT&&KD.some(k=>{const c=Math.cos(k[3]),s=Math.sin(k[3]),W=k[10]||k[4],dx=k[0]+c*W/2,dz=k[2]+s*W/2;return dx>a.x0-4.5&&dx<a.x1+4.5&&dz>a.z0-4.5&&dz<a.z1+4.5&&Math.abs(k[1]-H(dx,dz))<1.5;}))continue;
    {const gb=groundBase(x,z,dims[0],dims[1],ry);if(gb.top-gb.bot>2.5)continue;addBPad(a,gb.top-0.05,4,2);}reserve(a,'prop');
    const gq=groundBase(x,z,dims[0],dims[1],ry);const g=gq.top;push(x,g,z,ry,{base:g});box(0,gq.bot-g-0.5,0,dims[0]+0.2,g-gq.bot+0.5,dims[1]+0.2,COL.conD,{nc:true});
    if(kind==='gar'){const L=Math.round(dims[0]/3)*3;box(0,-0.3,0,L,2.8,6,COL.conD);for(let i=0;i<L/3;i++)box(-L/2+1.5+i*3,0,3.02,2.6,2.2,0.08,pick([COL.rust,COL.green,COL.blue,COL.rust]),{nc:true});box(0,2.5,0,L+0.4,0.2,6.6,COL.rust,{nc:true});}
    else if(kind==='kiosk'){box(0,0,0,3,1.1,3,COL.blue);box(0,1.1,0,3,1.2,3,COL.glass);box(0,2.3,0,3.8,0.3,3.8,COL.white);}
    else if(kind==='play'){box(0,-0.1,0,16,0.12,12,[0.55,0.48,0.36],{nc:true});cyl(-4,0,0,1.2,1.2,5,8,COL.red,{open:true,coll:true});cyl(-4,5,0,1.2,0.1,2.5,8,COL.white,{});
      for(const zz of [-2,2])beamL([3,0,zz],[3,2.8,zz],0.1,0.1,COL.steel,{nc:true});beamL([3,2.8,-2],[3,2.8,2],0.1,0.1,COL.steel,{nc:true});box(3,0.5,-0.6,0.5,0.06,0.3,COL.wood,{nc:true});box(3,0.5,0.6,0.5,0.06,0.3,COL.wood,{nc:true});
      flight(4,4,0,8,4,1.8,0.8,COL.steel,false);box(4,0,4,0.8,1.8,0.8,COL.steel);
      box(-1,0,-4,3,0.3,3,COL.wood);}
    else if(kind==='trans'){box(0,0,0,4,3,3,COL.brick);box(0,3,0,4.4,0.2,3.4,COL.conD);box(1,0,1.52,1,2,0.05,COL.steel,{nc:true});}
    else if(kind==='sub'){box(0,0,0,9,4,6,COL.brick);box(0,4,0,9.4,0.3,6.4,COL.conD);box(-3,0,3.02,1.2,2.2,0.06,COL.steel,{nc:true});}
    else {box(0,0,0,2.4,0.45,0.5,COL.wood);}
    pop();
  }
}
function industryFill(){
  const rect={x0:212,x1:524,z0:-248,z1:362};
  let c=0;
  for(let t=0;t<9000&&c<46;t++){const x=rnd(rect.x0,rect.x1),z=rnd(rect.z0,rect.z1),ry=pick([0,HP]),len=pick([24,30,36,48]),span=pick([12,12,18,24]);
    const a=footAABB(x,z,len+4,span+4,ry);if(a.x0<rect.x0||a.x1>rect.x1||a.z0<rect.z0||a.z1>rect.z1||overlaps(a,3))continue;
    hall({x,z,ry,len,span,h:pick([6,8,10]),roof:chance(0.5)?'saw':'flat',catwalk:chance(0.4),machines:2});c++;}
  for(let t=0;t<300;t++){const x=rnd(rect.x0,rect.x1),z=rnd(rect.z0,rect.z1),ry=pick([0,HP]);const a=footAABB(x,z,12,3,ry);if(overlaps(a,2))continue;reserve(a,'prop');const g=H(x,z);push(x,g,z,ry);box(0,0,0,12,2.6,2.4,pick([COL.rust,COL.blue,COL.green,COL.red,COL.ochre]));if(chance(0.3))box(0,2.6,0,12,2.6,2.4,pick([COL.rust,COL.blue,COL.ochre]));pop();}
}
function riverWorks(){
  const skip=[-260,100,300,HWZ,-120,0];
  for(let z=-440;z<560;z+=20){const rx=riverX(z),rh=riverHalf(z);
    if(skip.some(q=>Math.abs(z-q)<14))continue;
    if(((z+440)%130+130)%130<14||((z+440)%130+130)%130>116)continue;
    for(const s of [-1,1]){const x=rx+s*(rh.top+0.6),g=H(x,z);let gm=g;for(let dz=-10;dz<=10;dz+=1)gm=Math.min(gm,H(x,z+dz));box(x,gm-0.3,z,0.5,g+1-(gm-0.3),20,COL.con);}}
  for(let z=-440;z<560;z+=130){const rx=riverX(z),rh=riverHalf(z),bed=-riverDepth(z);for(const s of [-1,1]){const xa=rx+s*(rh.top+1),xb=rx+s*(rh.bed-0.5),n=Math.max(2,Math.ceil(Math.abs(xb-xa)/1.5));let px=xa,py=H(xa,z)+0.12;for(let i=1;i<=n;i++){const x=lerp(xa,xb,i/n),y=Math.max(H(x,z),bed+0.3)+0.12;flight(px,z,py,x,z,y,2.2,COL.conL,'m');px=x;py=y;}}}
  for(let i=0;i<26;i++){const z=rnd(-420,560),rx=riverX(z)+rnd(-8,8),y=-riverDepth(z)+0.25,l=rnd(8,22),w=rnd(5,10);WATER.push({x0:rx-w/2,x1:rx+w/2,z0:z-l/2,z1:z+l/2,y});}
  for(let i=0;i<10;i++){rnd(-400,540);rnd(-9,9);rnd(0,PI*2);keepSeq3();}
}
// spatial index over building/feature footprints (rebuilt when the list grows)
let FGN=-1;const FG=new Map();
function footNear(x,z){if(FGN!==FOOT.length){FG.clear();for(const f of FOOT){for(let i=Math.floor((f.x0-1)/16);i<=Math.floor((f.x1+1)/16);i++)for(let k=Math.floor((f.z0-1)/16);k<=Math.floor((f.z1+1)/16);k++){const key=i*10007+k;let a=FG.get(key);if(!a){a=[];FG.set(key,a);}a.push(f);}}FGN=FOOT.length;}
  return FG.get(Math.floor(x/16)*10007+Math.floor(z/16))||[];}
// ---------- continuous paving: fill pavement gaps and pave every street corner ----------
let PAVED={runs:0,corners:0};
function pavingFill(){NORNG=true;try{
  const G=new Map(),idx=f=>{const [ax,az,ya,bx,bz,yb,w]=f;const L=Math.hypot(bx-ax,bz-az)||1e-6;const rec={ax,az,ux:(bx-ax)/L,uz:(bz-az)/L,L,hw:w/2};
    const x0=Math.min(ax,bx)-w,x1=Math.max(ax,bx)+w,z0=Math.min(az,bz)-w,z1=Math.max(az,bz)+w;for(let i=Math.floor(x0/10);i<=Math.floor(x1/10);i++)for(let k=Math.floor(z0/10);k<=Math.floor(z1/10);k++){const key=i*10007+k;let a=G.get(key);if(!a){a=[];G.set(key,a);}a.push(rec);}};
  for(const f of FLIGHTS)idx(f);
  const paved=(x,z)=>{const a=G.get(Math.floor(x/10)*10007+Math.floor(z/10));if(!a)return false;for(const r of a){const dx=x-r.ax,dz=z-r.az,t=dx*r.ux+dz*r.uz,v=-dx*r.uz+dz*r.ux;if(t>=-0.05&&t<=r.L+0.05&&Math.abs(v)<=r.hw+0.05)return true;}return false;};
  const onDeck=(x,z)=>BRIDGES.some(b=>Math.abs(z-b.z)<=b.hw+0.05&&Math.abs(x-b.rx)<=b.half+0.05);
  const blocked=(x,z)=>footNear(x,z).some(f=>f.tag!=='road'&&f.tag!=='hwy'&&f.tag!=='rail'&&f.tag!=='prop'&&x>f.x0&&x<f.x1&&z>f.z0&&z<f.z1)||onDeck(x,z)||(inRiver(x,z,2)&&!onDeck(x,z));
  // 1) pavement gaps along every road
  for(const RD of ROADS){const P=RD.prof;if(!P||RD.nf)continue;const off=RD.w/2+1.5;
    for(const sd of [-1,1]){let run=null;const flush=()=>{if(run&&run.t1-run.t0>=0.9){const t0=Math.max(0,run.t0-0.6),t1=Math.min(P.L,run.t1+0.6);
        const a=[P.ax+P.ux*t0-P.uz*sd*off,P.az+P.uz*t0+P.ux*sd*off],b=[P.ax+P.ux*t1-P.uz*sd*off,P.az+P.uz*t1+P.ux*sd*off];
        const ya=profY(P,P.ax+P.ux*t0,P.az+P.uz*t0)+0.14,yb=profY(P,P.ax+P.ux*t1,P.az+P.uz*t1)+0.14;
        if(Math.abs(yb-ya)/Math.max(0.5,t1-t0)<0.12){flight(a[0],a[1],ya,b[0],b[1],yb,3,COL.conL,false);idx(FLIGHTS[FLIGHTS.length-1]);PAVED.runs++;}}run=null;};
      for(let t=0.5;t<P.L-0.5;t+=1){const fi=Math.round(t/P.step);const x=P.ax+P.ux*t-P.uz*sd*off,z=P.az+P.uz*t+P.ux*sd*off;
        const gap=!(P.tun&&P.tun[fi])&&!paved(x,z)&&!blocked(x,z);if(gap){if(!run)run={t0:t,t1:t};else run.t1=t;}else flush();}
      flush();}}
  // 2) corner squares where two pavements meet
  for(const A of ROADS)for(const B of ROADS){if(A===B||!A.prof||!B.prof||A.nf||B.nf)continue;const a=A.prof,b=B.prof,den=a.ux*b.uz-a.uz*b.ux;if(Math.abs(den)<0.5)continue;
    const dx=b.ax-a.ax,dz=b.az-a.az,t=(dx*b.uz-dz*b.ux)/den,u=(dx*a.uz-dz*a.ux)/den;if(t<-1||t>a.L+1||u<-1||u>b.L+1)continue;
    const nx=a.ax+a.ux*t,nz=a.az+a.uz*t,y=Math.max(profY(a,nx,nz),profY(b,nx,nz))+0.14;
    for(const sa of [-1,1])for(const sb of [-1,1]){const qx=nx-a.uz*sa*(A.w/2+1.5)-b.uz*sb*(B.w/2+1.5),qz=nz+a.ux*sa*(A.w/2+1.5)+b.ux*sb*(B.w/2+1.5);
      if(paved(qx,qz)||blocked(qx,qz))continue;const ang=Math.atan2(a.uz,a.ux);push(qx,y,qz,ang);box(0,-0.3,0,3.2,0.3,3.2,COL.conL,{m:MAT.floor});pop();
      FLIGHTS.push([qx-a.ux*1.6,qz-a.uz*1.6,y,qx+a.ux*1.6,qz+a.uz*1.6,y,3.2,0]);idx(FLIGHTS[FLIGHTS.length-1]);PAVED.corners++;}}
  // 2b) final sweep: any 1 m gap left on a pavement line gets a matching tile
  PAVED.patches=0;for(const RD of ROADS){const P=RD.prof;if(!P||RD.nf)continue;const off=RD.w/2+1.5;for(const sd of [-1,1])for(let t=0.5;t<P.L-0.5;t+=1){const fi=Math.round(t/P.step);if(P.tun&&P.tun[fi])continue;
      const x=P.ax+P.ux*t-P.uz*sd*off,z=P.az+P.uz*t+P.ux*sd*off;if(paved(x,z)||blocked(x,z))continue;const y=profY(P,P.ax+P.ux*t,P.az+P.uz*t)+0.13;
      const a=[x-P.ux*0.65,z-P.uz*0.65],b=[x+P.ux*0.65,z+P.uz*0.65];flight(a[0],a[1],y,b[0],b[1],y,3.2,COL.conL,false);idx(FLIGHTS[FLIGHTS.length-1]);PAVED.patches++;}}
  // 2c) metro forecourts
  if(CMPT)for(const e of FOOT.filter(f=>f.tag==='ent')){const cx=(e.x0+e.x1)/2,cz=(e.z0+e.z1)/2,y=H(cx,cz)+0.04;flight(e.x0-1,cz,y,e.x1+1,cz,y,e.z1-e.z0+2,COL.conL,false);idx(FLIGHTS[FLIGHTS.length-1]);
    let best=null,br=0;for(let r=8;r<=45&&!best;r+=1)for(let a=0;a<32;a++){const an=a/32*PI*2,tx=cx+Math.cos(an)*r,tz=cz+Math.sin(an)*r;if(!paved(tx,tz)||(tx>e.x0-1&&tx<e.x1+1&&tz>e.z0-1&&tz<e.z1+1))continue;let ok=true;for(let t=7;t<r;t+=0.5){const qx=cx+Math.cos(an)*t,qz=cz+Math.sin(an)*t;if(coveredAt(qx,H(qx,qz)+1,qz)){ok=false;break;}}if(ok){best=[tx,tz,an];br=r;break;}}
    if(best){const sx=cx+Math.cos(best[2])*7,sz=cz+Math.sin(best[2])*7;const n=Math.max(1,Math.ceil((br-7)/2));let px=sx,pz=sz,py=y;for(let i=1;i<=n;i++){const x=sx+(best[0]-sx)*i/n,z=sz+(best[1]-sz)*i/n,yy=H(x,z)+0.1;flight(px,pz,py,x,z,yy,2.4,COL.conL,false);idx(FLIGHTS[FLIGHTS.length-1]);px=x;pz=z;py=yy;}PAVED.paths++;}}
  // 3) footpaths from street doors to the nearest pavement
  const inBld=(x,z)=>footNear(x,z).some(f=>(f.tag==='res'||f.tag==='tower'||f.tag==='hall'||f.tag==='civic'||f.tag==='hero'||f.tag==='frame')&&x>f.x0+0.3&&x<f.x1-0.3&&z>f.z0+0.3&&z<f.z1-0.3);
  PAVED.paths=0;
  const obst=(x,z,y)=>{for(const o of cellList(x,z)){if(o.ramp||o.y1<y+0.35||o.y0>y+1.8)continue;const dx=x-o.cx,dz=z-o.cz,u=dx*o.c+dz*o.s,v=-dx*o.s+dz*o.c;if(Math.abs(u)<o.hx+0.45&&Math.abs(v)<o.hz+0.45)return true;}return false;};
  const segPath=(ax,az,ay,bx,bz)=>{const L=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.ceil(L/2));let px=ax,pz=az,py=ay;for(let i=1;i<=n;i++){const x=ax+(bx-ax)*i/n,z=az+(bz-az)*i/n,y=Math.max(H(x,z),py-1.2*L/n)+0.1;const st=Math.abs(y-py)/(L/n)>0.12;flight(px,pz,py,x,z,y,1.8,COL.conL,st?'m':false);idx(FLIGHTS[FLIGHTS.length-1]);px=x;pz=z;py=y;}};
  for(const k of KD){if(k[7]&1)continue;let out=k[8]>=k[9]?1:-1;if(!CMPT&&Math.max(k[8],k[9])<1)continue;
    {const c0=Math.cos(k[3]),s0=Math.sin(k[3]),W0=k[10]||k[4],ex=k[0]+c0*W0/2,ez=k[2]+s0*W0/2;if(CMPT){const p1=[ex-s0*3.5,ez+c0*3.5],p2=[ex+s0*3.5,ez-c0*3.5],o1=!inBld(p1[0],p1[1]),o2=!inBld(p2[0],p2[1]);if(o1===o2)continue;out=o1?1:-1;}}
    const c=Math.cos(k[3]),s=Math.sin(k[3]),W=k[10]||k[4],mx=k[0]+c*W/2,mz=k[2]+s*W/2,nx=-s*out,nz=c*out;
    const g0=H(mx+nx*1.0,mz+nz*1.0);if(Math.abs(k[1]-g0)>1.2)continue;
    if(CMPT){let blockedOut=false;for(let d=0.7;d<=2.2&&!blockedOut;d+=0.3){const x=mx+nx*d,z=mz+nz*d;for(const o of cellList(x,z)){if(o.ramp||o.y1-o.y0<2||o.y1<k[1]+0.35||o.y0>k[1]+1.8)continue;const dx=x-o.cx,dz=z-o.cz,u=dx*o.c+dz*o.s,v=-dx*o.s+dz*o.c;if(Math.abs(u)<o.hx+0.1&&Math.abs(v)<o.hz+0.1){blockedOut=true;break;}}}if(blockedOut)continue;}
    const sx=mx+nx*2.2,sz=mz+nz*2.2;if(paved(sx,sz))continue;
    let hit=null;for(let d=2.2;d<=30;d+=0.5){const x=mx+nx*d,z=mz+nz*d;if(inBld(x,z)||inRiver(x,z,2)||(CMPT&&obst(x,z,H(x,z))))break;if(paved(x,z)){hit=d;break;}}
    if(CMPT&&!hit){const ya0=Math.max(H(sx,sz),k[1]-0.6);let best=null;
      for(let r=3;r<=40&&!best;r+=1)for(let a=0;a<32;a++){const an=a/32*PI*2,tx=sx+Math.cos(an)*r,tz=sz+Math.sin(an)*r;if(!paved(tx,tz))continue;let clear=true;for(let t=0.5;t<r;t+=0.5){const qx=sx+(tx-sx)*t/r,qz=sz+(tz-sz)*t/r;if(coveredAt(qx,H(qx,qz)+1,qz)||inRiver(qx,qz,2)||obst(qx,qz,H(qx,qz))){clear=false;break;}}if(clear){best=[tx,tz];break;}}
      if(best){segPath(sx,sz,ya0+0.05,best[0],best[1]);flight(mx+nx*0.6,mz+nz*0.6,Math.max(ya0,k[1]-0.02),sx,sz,ya0+0.05,2.2,COL.conL,false);PAVED.paths++;}continue;}
    if(!hit||hit<3)continue;
    const ya=Math.max(H(sx,sz),k[1]-0.6);let px=sx,pz=sz,py=ya+0.05;const end=hit+0.4,n=Math.max(1,Math.ceil((end-2.2)/2));
    for(let i=1;i<=n;i++){const d=2.2+(end-2.2)*i/n,x=mx+nx*d,z=mz+nz*d,y=Math.max(H(x,z),py-1.2*(end-2.2)/n)+0.1;const st=Math.abs(y-py)/((end-2.2)/n)>0.12;flight(px,pz,py,x,z,y,1.8,COL.conL,st?'m':false);idx(FLIGHTS[FLIGHTS.length-1]);px=x;pz=z;py=y;}
    // apron between the entrance and the path
    flight(mx+nx*0.6,mz+nz*0.6,Math.max(ya,k[1]-0.02),sx,sz,ya+0.05,2.2,COL.conL,false);PAVED.paths++;}
}finally{NORNG=false;}}
// ---------- frontage aprons: pave the strip between the pavement and building faces ----------
function frontageAprons(){NORNG=true;let n=0;try{
  const G=new Map(),idx=f=>{const [ax,az,ya,bx,bz,yb,w]=f;const L=Math.hypot(bx-ax,bz-az)||1e-6;const rec={ax,az,ux:(bx-ax)/L,uz:(bz-az)/L,L,hw:w/2};
    const x0=Math.min(ax,bx)-w,x1=Math.max(ax,bx)+w,z0=Math.min(az,bz)-w,z1=Math.max(az,bz)+w;for(let i=Math.floor(x0/10);i<=Math.floor(x1/10);i++)for(let k=Math.floor(z0/10);k<=Math.floor(z1/10);k++){const key=i*10007+k;let a=G.get(key);if(!a){a=[];G.set(key,a);}a.push(rec);}};
  for(const f of FLIGHTS)idx(f);
  const paved=(x,z)=>{const a=G.get(Math.floor(x/10)*10007+Math.floor(z/10));if(!a)return false;for(const r of a){const dx=x-r.ax,dz=z-r.az,t=dx*r.ux+dz*r.uz,v=-dx*r.uz+dz*r.ux;if(t>=-0.05&&t<=r.L+0.05&&Math.abs(v)<=r.hw+0.05)return true;}return false;};
  const bld=(x,z)=>footNear(x,z).some(f=>(f.tag==='res'||f.tag==='tower'||f.tag==='civic'||f.tag==='hall'||f.tag==='hero')&&x>f.x0&&x<f.x1&&z>f.z0&&z<f.z1);
  const other=(x,z)=>footNear(x,z).some(f=>(f.tag==='prop'||f.tag==='ent'||f.tag==='park'||f.tag==='square'||f.tag==='frame'||f.tag==='pipe')&&x>f.x0&&x<f.x1&&z>f.z0&&z<f.z1);
  for(const RD of ROADS){const P=RD.prof;if(!P||RD.nf)continue;const e0=RD.w/2+3;
    for(const sd of [-1,1])for(let t=2;t<P.L-2;t+=4){const fi=Math.round(t/P.step);if(P.tun&&P.tun[fi])continue;
      const cx=P.ax+P.ux*t,cz=P.az+P.uz*t,ox=-P.uz*sd,oz=P.ux*sd;if(inRiver(cx+ox*e0,cz+oz*e0,4))continue;
      let g=null;for(let d=0.5;d<=6;d+=0.5){const x=cx+ox*(e0+d),z=cz+oz*(e0+d);if(bld(x,z)){g=d;break;}if(paved(x,z)||other(x,z)||inOtherRoad(x,z,RD)){g=-1;break;}}
      if(!g||g<0.6)continue;
      const a=[cx+ox*(e0-0.05),cz+oz*(e0-0.05)],b=[cx+ox*(e0+g),cz+oz*(e0+g)],ya=profY(P,cx,cz)+0.14,yb=Math.max(H(b[0],b[1]),ya-g*0.12)+0.06;
      if(Math.abs(yb-ya)/g>0.2)continue;
      flight(a[0],a[1],ya,b[0],b[1],yb,4.05,COL.conL,false);idx(FLIGHTS[FLIGHTS.length-1]);n++;}}
}finally{NORNG=false;}return n;}
// ---------- any path, ramp or step still showing ground gets its own cutting ----------
function flightClearance(){let n=0;
  for(const f of FLIGHTS){const [ax,az,ya,bx,bz,yb,w,st]=f;if(w>9)continue;const L=Math.hypot(bx-ax,bz-az)||1e-6,ux=(bx-ax)/L,uz=(bz-az)/L;let bad=false;
    for(let s=0.1;s<=L-0.1&&!bad;s+=0.5)for(const off of [0,-(w/2-0.1),(w/2-0.1)]){const x=ax+ux*s-uz*off,z=az+uz*s+ux*off,y=ya+(yb-ya)*s/L,h=H(x,z);if(h>y+0.02&&h<y+3.5){bad=true;break;}}
    if(!bad)continue;const m=w/2+1.4;
    CUTS.push({x0:Math.min(ax,bx)-m,x1:Math.max(ax,bx)+m,z0:Math.min(az,bz)-m,z1:Math.max(az,bz)+m,fine:true,fn:(px,pz)=>{const t=(px-ax)*ux+(pz-az)*uz;if(t<-0.4||t>L+0.4||Math.abs(-(px-ax)*uz+(pz-az)*ux)>m)return 1e9;return ya+(yb-ya)*Math.max(0,Math.min(L,t))/L-0.3;}});
    FINE_MARK.push({x0:Math.min(ax,bx)-m,x1:Math.max(ax,bx)+m,z0:Math.min(az,bz)-m,z1:Math.max(az,bz)+m,f:[ax,az,ya,bx,bz,yb,w,st||0]});n++;}
  return n;}
let APRONS=0,CLEARED=0;
// ---------- handrails on outdoor step flights (entrances, tower stairs) ----------
let RAILED=0;
function flightRails(i0,i1){NORNG=true;try{
  for(let i=i0;i<i1;i++){const [ax,az,ya,bx,bz,yb,w,st]=FLIGHTS[i];if(Math.abs(yb-ya)<0.45||w>5)continue;const L=Math.hypot(bx-ax,bz-az)||1,ux=(bx-ax)/L,uz=(bz-az)/L,nx=-uz,nz=ux;RAILED++;
    for(const sd of [-1,1]){const o=w/2-0.07,p0=[ax+nx*o*sd,az+nz*o*sd],p1=[bx+nx*o*sd,bz+nz*o*sd];
      beamL([p0[0],ya+0.95,p0[1]],[p1[0],yb+0.95,p1[1]],0.05,0.05,COL.rust,{nc:true});beamL([p0[0],ya+0.5,p0[1]],[p1[0],yb+0.5,p1[1]],0.03,0.03,COL.rust,{nc:true,mat:6});
      box(p0[0],ya,p0[1],0.06,0.98,0.06,COL.rust,{nc:true});box(p1[0],yb,p1[1],0.06,0.98,0.06,COL.rust,{nc:true});
      const n=Math.floor(L/0.9);for(let k=1;k<n;k++){const t=k/n;box(p0[0]+(p1[0]-p0[0])*t,ya+(yb-ya)*t,p0[1]+(p1[1]-p0[1])*t,0.03,0.95,0.03,COL.rust,{nc:true,mat:6});}}}
}finally{NORNG=false;}}
// ---------- utility poles + sagging wires (deterministic, no layout RNG) ----------
function utilityPoles(){
  const blocked=(x,z)=>{for(const f of FOOT){if(f.tag==='road'||f.tag==='hwy'||f.tag==='rail')continue;if(x>f.x0-0.6&&x<f.x1+0.6&&z>f.z0-0.6&&z<f.z1+0.6)return true;}return false;};
  ROADS.forEach((RD,ri)=>{if(RD.w>12||RD.nf)return;const P=RD.prof;if(!P)return;const side=ri%2?1:-1,off=RD.w/2+2.6,ang=Math.atan2(P.uz,P.ux);
    let prev=null;
    for(let t=14;t<=P.L-14;t+=33){const cx=P.ax+P.ux*t,cz=P.az+P.uz*t,fi=Math.round(t/P.step);if(P.tun[fi]||inRiver(cx,cz,4)){prev=null;continue;}
      const x=cx-P.uz*side*off,z=cz+P.ux*side*off;if(inOtherRoad(x,z,RD)||blocked(x,z)){prev=null;continue;}
      const y=profY(P,cx,cz)+0.26,hh=8.6+((Math.sin(x*3.1+z*1.7)*43758.5)%1+1)%1*0.8,lean=(((Math.sin(x*7.3+z*2.9)*91.7)%1+1)%1-0.5)*0.05;
      const gpo=Math.min(y,H(x,z))-0.5;push(x,y,z,ang);box(0,gpo-y,0,0.26,hh-(gpo-y),0.26,[0.27,0.22,0.17]);
      const tops=[];for(const a of [-0.95,0,0.95]){tops.push(toW(lean*hh,hh-0.35,a));}
      box(lean*hh,hh-0.5,0,0.14,0.14,2.3,[0.25,0.2,0.15],{nc:true});
      for(const a of [-0.95,0,0.95])box(lean*hh,hh-0.43,a,0.08,0.16,0.08,[0.55,0.58,0.55],{nc:true});
      box(0.18,hh-2.4,0,0.5,0.7,0.4,[0.33,0.34,0.33],{nc:true});
      pop();
      if(prev){for(let k=0;k<3;k++){const a=prev[k],b=tops[k],sag=0.55+0.25*k,N=6;let p0=a;for(let i=1;i<=N;i++){const f=i/N,p1=[lerp(a[0],b[0],f),lerp(a[1],b[1],f)-sag*4*f*(1-f),lerp(a[2],b[2],f)];beamL(p0,p1,0.035,0.035,[0.08,0.08,0.08],{nc:true});p0=p1;}}}
      prev=tops;}
  });
}
let BRICKED=0;
// ---------- SAFE HOUSE: Block 7, Flat 3B (layout from Flat_3B.html, 1:1 scale) ----------
const SAFE={x:-122,z:-178,ry:0,floors:5};
function safeHouse(){
  const {x,z,ry,floors}=SAFE,L=22.6,D=10;
  const a=footAABB(x,z,L+2,D+2,ry);const gb=groundBase(x,z,L,D,ry);const y0=gb.top;SAFE.y=y0;
  reserve(a,'hero');addBPad(footAABB(x,z,L+0.5,D+0.5,ry),y0-0.05,10);
  push(x,y0,z,ry,{base:y0});
  box(0,gb.bot-y0-1.5,0,L+0.4,y0-gb.bot+1.5,D+0.4,COL.conD);
  const FW=[[1.08,1.88,1.05,2.0],[4.0,5.1,0.8,2.1],[6.4,7.5,0.8,2.1]];
  const WP={m:MAT.wallpaper},PQ={m:MAT.parquet},TL={m:MAT.tile};
  const WALLP=[0.66,0.58,0.47],WALLB=[0.52,0.57,0.55];
  for(let f=0;f<floors;f++){const y=f*3;
    // floor slab (stair hole above ground floor)
    slabR(-11.3,11.3,-5,5,y,0.3,f>0?[stairHole(0,2.3,1)]:[],COL.conL);
    // facade: front (z-) with flat windows, back (z+) corridor windows, gables
    const fo=[];for(const s of [-1,1])for(const w of FW){const c=s*(2+(w[0]+w[1])/2);fo.push({x:c,w:w[1]-w[0],sill:w[2],top:w[3]});}
    fo.push({x:0,w:1.2,sill:1.8,top:2.6});
    wallRun(-11.3,11.3,-4.85,0.3,y,3,fo,COL.panel);
    const bo=[{x:-8,w:1.2,sill:1.0,top:2.2},{x:8,w:1.2,sill:1.0,top:2.2},{x:-4,w:1.2,sill:1.0,top:2.2},{x:4,w:1.2,sill:1.0,top:2.2}];
    if(f===0)bo.push({x:0,w:1.4,sill:0,top:2.2});else bo.push({x:0,w:1.2,sill:1.0,top:2.2});
    wallRun(-11.3,11.3,4.85,0.3,y,3,bo,COL.panel);
    wallRunZ(-5,5,11.15,0.3,y,3,[{x:-4.7+5.55,w:1.1,sill:0.8,top:2.1}],COL.panel);
    wallRunZ(-5,5,-11.15,0.3,y,3,[{x:-4.7+5.55,w:1.1,sill:0.8,top:2.1}],COL.panel);
    // stair hall partitions and corridor wall (flat entrance doors)
    const IMP=f===2; // floor 3: Flat 3B is imported from the original file
    for(const s of [-1,1]){if(IMP&&s>0){NORNG=true;wallRunZ(-4.7,2.3,s*1.69,0.38,y,3,[],COL.green);NORNG=false;}else wallRunZ(-4.7,2.3,s*1.825,0.65,y,3,[],COL.green);}
    wallRun(-11,-2.15,2.35,0.2,y,3,[{x:-(2+3.75),w:0.9,sill:0,top:2.08}],COL.green);
    if(!IMP)wallRun(2.15,11,2.35,0.2,y,3,[{x:2+3.75,w:0.9,sill:0,top:2.08}],COL.green);
    if(f<floors-1)stairs(0,2.3,1,y,3,f===2?3:1,COL.conL);
    box(0,y+2.85,3.5,0.6,0.08,0.25,COL.lamp,{nc:true,e:true});box(0,y+2.85,-1,0.6,0.08,0.25,COL.lamp,{nc:true,e:true});
    // every flat gets the 3B partition plan; only 3B is furnished
    for(const side of [-1,1]){const fx0=side>0?2:-2;if(IMP&&side>0)continue;
      push(fx0,y,-4.7,side>0?0:0);
      const X=v=>side>0?v:-v;
      const wx=(a,b,zz,ops,col,o)=>{if(side>0)wallRun(a,b,zz,0.12,0,2.7,ops,col,o);else wallRun(-b,-a,zz,0.12,0,2.7,(ops||[]).map(p=>Object.assign({},p,{x:-p.x})),col,o);};
      const wz=(a,b,xx,ops,col,o)=>wallRunZ(a,b,X(xx),0.12,0,2.7,ops,col,o);
      const isSafe=false;const cw=isSafe?WALLP:COL.white,co=isSafe?WP:undefined;
      wx(0.06,2.44,4.2,[],cw,co);wx(2.44,5.06,4.2,[{x:3.7,w:1.4,sill:0,top:2.1}],cw,Object.assign({noKit:true},co||{}));
      wx(5.06,8.94,4.2,[{x:6.42,w:0.85,sill:0,top:2.08}],isSafe?WALLB:cw,co);
      wz(4.26,6.94,2.5,[{x:5.7,w:0.8,sill:0,top:2.08}],isSafe?[0.74,0.76,0.72]:cw,isSafe?TL:co);
      wz(4.26,6.94,5.0,[],isSafe?WALLB:cw,co);
      pop();}
  }
  slabR(-11.3,11.3,-5,5,floors*3,0.3,[],COL.conD);box(0,floors*3,4.6,22.6,1.1,0.3,COL.con);box(0,floors*3,-4.6,22.6,1.1,0.3,COL.con);
  for(const s of [-1,1])box(s*11.0,floors*3,0,0.3,1.1,10,COL.con);
  // rooftop stair kiosk
  box(0,floors*3,0.2,3.6,2.6,4.4,COL.panel);
  pop();
  SAFE.y0=y0;SAFE.flat=[x+2,y0+6,z-4.7];
  {const fx=x+2,fz=z-4.7,fy=y0+6;for(const K of [KW,KD])for(let i=K.length-1;i>=0;i--){const k=K[i];if(k[0]>fx-0.3&&k[0]<fx+9.3&&k[2]>fz-0.4&&k[2]<fz+7.2&&k[1]>fy-0.5&&k[1]<fy+2.8)K.splice(i,1);}}
  XTRA.push(['Safe house: Flat 3B',x+2+6.0,y0+6,z-4.7+2.7,250,'Block 7, third floor: the original Flat 3B'],['Safe house: Block 7 stairwell',x,y0,z+3.5,180,'Rear entrance to the safe-house block']);
}
// Flat 3B furnishings, in flat-local metres (fx 0..9 along the window wall, fz 0..7 from window wall to corridor)
// ---------- precast facade detail: panel joints between window columns, plinth course, coping, entrance canopies ----------
function liftLandingCleanup(){for(const L of LIFTS){const c=Math.cos(L.bry),s=Math.sin(L.bry),ox=L.bx+L.lx*c-L.lz*s,oz=L.bz+L.lx*s+L.lz*c;
  for(let i=KD.length-1;i>=0;i--){const k=KD[i];const cc=Math.cos(k[3]),ss=Math.sin(k[3]),W=k[10]||k[4],mx=k[0]+cc*W/2,mz=k[2]+ss*W/2;
    if(Math.hypot(mx-ox,mz-oz)<0.7&&L.stops.some(y=>Math.abs(k[1]-y)<0.5))KD.splice(i,1);}}}
// doorways that open straight onto a wall are bricked up (as in many abandoned blocks)
function brickUpBlockedDoors(){NORNG=true;let n=0;try{
  const solidAt=(x,y,z)=>{const L=cellList(x,z);for(const o of L){if(o.ramp||y<o.y0||y>o.y1)continue;const dx=x-o.cx,dz=z-o.cz,u=dx*o.c+dz*o.s,v=-dx*o.s+dz*o.c;if(Math.abs(u)<=o.hx&&Math.abs(v)<=o.hz)return true;}return false;};
  for(let i=KD.length-1;i>=0;i--){const k=KD[i];if(k[7]&1)continue;const c=Math.cos(k[3]),s=Math.sin(k[3]),nx=-s,nz=c,W=k[10]||k[4],mx=k[0]+c*W/2,mz=k[2]+s*W/2,y=k[1]+1.0,d=k[6]/2+0.45;
    if(!(solidAt(mx+nx*d,y,mz+nz*d)||solidAt(mx-nx*d,y,mz-nz*d)))continue;
    push(mx,k[1],mz,k[3]);box(0,0,0,W+0.02,k[5]+0.02,k[6]*0.9,COL.brick,{flat:true});box(0,k[5]-0.02,0,W+0.2,0.12,k[6]+0.04,COL.conD,{flat:true,nc:true});pop();
    KD.splice(i,1);if(i+1<KD.length&&(KD[i][7]&1)&&Math.hypot(KD[i][0]-k[0]-c*W,KD[i][2]-k[2]-s*W)<0.3)KD.splice(i,1);n++;}
}finally{NORNG=false;}return n;}
// lift machine rooms on tower roofs, TV aerials on slab roofs
function roofScape(){NORNG=true;try{
  const hsh=(a,b,c)=>((Math.sin(a*12.9898+b*78.233+c*37.719)*43758.5453)%1+1)%1;
  for(const T of TOWERS){const h=(T.S||24)/2,yr=T.base+T.n*3;push(T.x,yr,T.z,T.ry);
    box(2.0,0,0,3.4,2.9,7.4,COL.panel);box(2.0,2.9,0,3.7,0.18,7.7,COL.conD,{nc:true});
    for(const sz of [-1,1])box(3.73,1.4,sz*1.9,0.06,0.9,1.4,COL.steel,{nc:true,m:MAT.steel});
    box(2.0-1.73,0,2.6,0.06,2.1,0.9,[0.3,0.33,0.34]);box(2.0,2.95,0,0.5,0.9,0.5,COL.steel,{nc:true});
    for(let a=0;a<3;a++){const ax=-h+3+hsh(T.x,T.z,a)*(h*2-6),az=-h+3+hsh(T.z,T.x,a+5)*(h*2-6);if(Math.abs(ax)<5&&Math.abs(az)<5)continue;aerial(ax,0,az,3.2+hsh(a,T.x,1)*1.6,hsh(T.x,a,2)*PI);}
    pop();}
  for(const S of SLABS){const yr=S.base+S.n*3,cnt=Math.floor(S.L/9);push(S.x,yr,S.z,S.ry);
    for(let a=0;a<cnt;a++){const ax=-S.L/2+3+hsh(S.x,S.z,a)*(S.L-6),az=(hsh(S.z,S.x,a)-0.5)*(S.zf*2-3);if(Math.abs(ax-S.c)<3.2)continue;aerial(ax,0,az,2.6+hsh(a,S.x,3)*2.2,hsh(S.z,a,4)*PI);}
    pop();}
}finally{NORNG=false;}}
function aerial(x,y,z,hh,ang){box(x,y,z,0.06,hh,0.06,COL.steel,{nc:true});box(x,y,z,0.3,0.12,0.3,COL.conD,{nc:true});
  const c=Math.cos(ang),s=Math.sin(ang);for(let i=0;i<3;i++){const yy=y+hh-0.25-i*0.55,L=1.3-i*0.25;push(x,yy,z,ang);box(0,0,0,L,0.025,0.025,COL.steel,{nc:true});for(let j=-2;j<=2;j++)box(j*L/5,0,0,0.02,0.02,0.45,COL.steel,{nc:true,mat:6});pop();}
  for(const a of [0,2.1,4.2])beamL([x,y+hh*0.7,z],[x+Math.cos(a+ang)*1.6,y+0.05,z+Math.sin(a+ang)*1.6],0.01,0.01,COL.dark,{nc:true,flat:true,mat:6});}
// blast holes: rebuild broken wall and slab outside a circle so the opening reads round, ragged rim, sagging slabs, rebar, scorch, rubble heap
let BLASTS=0;const BLAST_LIGHTS=[];
function blastHoles(){NORNG=true;try{const hsh=(a,b,c)=>((Math.sin(a*12.9898+b*78.233+c*37.719)*43758.5453)%1+1)%1;const SOOT=[0.2,0.19,0.18],WALL=[0.5,0.49,0.46],SLAB=[0.44,0.43,0.41];
  for(const T of TOWERS){if(!T.hole)continue;BLASTS++;const h=T.h,FH=3,f0=T.hole[0],f1=T.hole[1]+1,yc=(f0+f1)/2*FH,Rc=Math.min((f1-f0)*FH/2+1.2,h-1.2),depth=h-4.5;
    push(T.x,T.base,T.z,T.ry);
    {const c0=Math.cos(T.ry),s0=Math.sin(T.ry);for(let f=f0;f<f1;f++){const dy=f*FH+1.5-yc;if(dy*dy>=Rc*Rc)continue;const wz=Math.sqrt(Rc*Rc-dy*dy);BLAST_LIGHTS.push({x:T.x+h*c0,y:T.base+f*FH+1.5,z:T.z+h*s0,ix:-c0,iz:-s0,w:wz*2,y0:T.base+f*FH-1,y1:T.base+f*FH+3.6});}}
    for(let f=f0;f<f1;f++){const y=f*FH;
      // wall rebuilt outside the circle in 0.75 m bands, jittered so the rim is broken rather than stepped
      for(let b=0;b<4;b++){const yb=y+b*0.75,ym=yb+0.375,dy=ym-yc,wz=dy*dy<Rc*Rc?Math.sqrt(Rc*Rc-dy*dy):0;
        for(const sg of [-1,1]){const j=(hsh(T.x,f*4+b,sg)-0.5)*1.1,z0=Math.min(h,wz+j);if(z0>=h-0.05)continue;const zc=sg*(z0+h)/2,len=h-z0;
          box(h-0.15,yb,zc,0.3,0.75,len,wz>0.1&&len<1.6?SOOT:WALL,{});if(wz>0.1){box(h-0.4-hsh(f,b,sg)*0.5,yb+hsh(b,f,sg)*0.3,sg*(z0+0.15),0.35+hsh(sg,f,b)*0.6,0.25+hsh(f,sg,b)*0.4,0.3,SOOT,{nc:true});
            beamL([h-0.15,yb+0.35,sg*z0],[h-0.15-0.6-hsh(f,b,2)*0.9,yb+0.1+hsh(b,2,f)*0.5,sg*(z0-0.3-hsh(2,f,b)*0.9)],0.025,0.025,COL.rust,{nc:true});}}}
      // floor slab rebuilt outside the circle at slab level; a sagging broken edge hangs into the opening
      const dy0=y-yc,ws=dy0*dy0<Rc*Rc?Math.sqrt(Rc*Rc-dy0*dy0):0;
      for(const sg of [-1,1]){const z0=Math.min(h,ws+(hsh(f,sg,9)-0.5)*0.8);if(z0<h-0.05)box(4.5+depth/2,y-0.3,sg*(z0+h)/2,depth,0.3,h-z0,SLAB,{});
        if(ws>0.6&&f>f0){const sl=0.6+hsh(f,sg,3)*0.8;push(4.5+depth*(0.3+hsh(sg,f,4)*0.4),y-0.15,sg*(z0-sl/2+0.1),0);const tilt=0.35+hsh(f,sg,5)*0.4;
          F.tilt=null;box(0,-sl*Math.sin(tilt)/2,0,1.6+hsh(f,1,sg),0.22,sl,SOOT,{nc:true});pop();}}
      if(ws>0.6&&f>f0)for(let k=0;k<5;k++){const zz=(hsh(f,k,7)-0.5)*2*ws*0.9;beamL([4.5,y-0.15,zz],[4.5+0.4+hsh(k,f,8)*1.2,y-0.6-hsh(f,k,9)*1.4,zz+(hsh(k,9,f)-0.5)],0.025,0.025,COL.rust,{nc:true});}}
    // side walls returned where the circle no longer reaches the corners (with dark empty window holes)
    for(let f=f0;f<f1;f++){const y=f*FH,dyl=Math.max(Math.abs(y-yc),Math.abs(y+FH-yc)),wmin=dyl<Rc?Math.sqrt(Rc*Rc-dyl*dyl):0;if(wmin>h-1.5)continue;
      for(const sg of [-1,1]){box(4.5+depth/2,y,sg*(h-0.15),depth,FH,0.3,WALL,{});box(4.5+depth/2,y+0.9,sg*(h+0.02),1.4,1.4,0.04,[0.06,0.06,0.07],{nc:true});}}
    pop();
    // rubble heap at the foot of the blasted face (never spilling against a neighbouring building)
    const c=Math.cos(T.ry),s=Math.sin(T.ry),own=FOOT.find(f=>f.tag==='tower'&&T.x>f.x0&&T.x<f.x1&&T.z>f.z0&&T.z<f.z1),nb=(x,z)=>FOOT.some(f=>f!==own&&f.tag!=='road'&&f.tag!=='prop'&&x>f.x0-3&&x<f.x1+3&&z>f.z0-3&&z<f.z1+3);
    for(let k=0;k<11;k++){const r=k*1.0,a=(hsh(T.z,k,11)-0.5)*1.8,lx=h+1.2+Math.cos(a)*r,lz=Math.sin(a)*r*1.2,wx=T.x+lx*c-lz*s,wz=T.z+lx*s+lz*c,g=H(wx,wz),mh=Math.max(0.35,2.6*(1-r/11));if(nb(wx,wz))continue;
      push(wx,g-0.25,wz,T.ry+hsh(k,T.x,12)*1.2-0.6);const mw=4.2-r*0.15,md=3.6-r*0.12,tiers=Math.ceil((mh+0.25)/0.4);for(let t=0;t<tiers;t++){const f=1-t/(tiers+0.6),ty=t*0.4;box((hsh(k,t,13)-0.5)*0.5,ty,(hsh(t,k,14)-0.5)*0.5,mw*f,Math.min(0.4,mh+0.25-ty),md*f,(k+t)%3===0?SOOT:SLAB,{});}pop();}
    for(let k=0;k<70;k++){const r=Math.pow(hsh(T.x,k,1),0.7)*11,a=(hsh(k,T.z,2)-0.5)*2.4,lx=h+0.5+Math.cos(a)*r,lz=Math.sin(a)*r*1.3;
      const wx=T.x+lx*c-lz*s,wz=T.z+lx*s+lz*c,g=H(wx,wz),hgt=Math.max(0,2.6*(1-r/11)-0.3),sz=0.3+hsh(k,3,T.x)*(r<5?1.6:0.9);if(nb(wx,wz))continue;
      const want=g+hsh(k,4,T.z)*hgt*0.6,rest=Math.max(g,groundAt(wx,wz,want+0.25));push(wx,Math.min(want,rest)+sz*0.15,wz,hsh(k,5,T.x)*PI*2);{const cw=sz*(0.8+hsh(k,6,1)*0.8),ch=sz*0.6;box(0,-sz*0.3,0,cw,ch,sz,k%5===0?SOOT:WALL,{nc:true});if(sz>0.5)climbSolid(cw,ch,sz,-sz*0.3);}pop();
      if(k%7===0){push(wx,g+0.2,wz,hsh(k,8,T.z)*PI);beamL([0,0,0],[1.2,0.5+hsh(k,9,1),0.3],0.025,0.025,COL.rust,{nc:true});pop();}}}
  // Tower 245: the gutted floors 18-24 cut a straight slot through both side faces; rebuild wall outside an ellipse so the breach reads torn
  {const X=T245.x,Z=T245.z,h=15,FH=3,yc=(18+25)/2*FH,Ry=11.2,Rz=6.6;push(X,0,Z,0);
    for(const sx of [-1,1])for(let f=18;f<25;f++){const y=f*FH;for(let b=0;b<4;b++){const yb=y+b*0.75,dy=(yb+0.375-yc)/Ry,wz=dy*dy<1?Rz*Math.sqrt(1-dy*dy):0;
      for(const sg of [-1,1]){const j=(hsh(f*4+b,sx,sg)-0.5)*1.0,z0=Math.max(0,Math.min(6,wz+j));if(z0>=5.95)continue;box(sx*(h-0.15),yb,sg*(z0+6)/2,0.3,0.75,6-z0,6-z0<1.6&&wz>0.1?SOOT:WALL,{});
        if(wz>0.1&&b===1)beamL([sx*(h-0.15),yb+0.4,sg*z0],[sx*(h-0.15-0.5-hsh(f,b,sx)*0.8),yb+0.1+hsh(b,f,sg)*0.5,sg*(z0-0.4-hsh(sg,f,b)*0.8)],0.025,0.025,COL.rust,{nc:true});}}
      const dyl=(y+1.5-yc)/Ry;if(dyl*dyl<1){const wz=Rz*Math.sqrt(1-dyl*dyl);BLAST_LIGHTS.push({x:X+sx*h,y:y+1.5,z:Z,ix:-sx,iz:0,w:wz*2,y0:y-1,y1:y+3.6});}}
    pop();}
}finally{NORNG=false;}}
// ---------- story props: evacuation checkpoint, luggage, survivors' flat, fire barrels, saplings, flooded underpasses, crow perches ----------
const FIRES=[],PERCH=[],STORY={};
function storyProps(){NORNG=true;try{const hs=(a,b,c)=>((Math.sin(a*12.9898+b*78.233+c*37.719)*43758.5453)%1+1)%1;
  const SAND=[0.47,0.42,0.3],JER=[0.6,0.59,0.55],RED=[0.6,0.12,0.1],WH=[0.82,0.8,0.74];
  const barrel=(x,z,y)=>{push(x,y,z,0);box(0,0,0,0.62,0.88,0.62,COL.rust);box(0,0.86,0,0.5,0.06,0.5,[1,0.55,0.2],{nc:true,e:true});for(let k=0;k<4;k++)box((hs(x,k,1)-0.5)*1.2,0,(hs(z,k,2)-0.5)*1.2,0.18,0.12,0.12,COL.dark,{nc:true,mat:6});pop();FIRES.push([x,y+0.92,z]);};
  // 1) checkpoint on a road leaving the city
  let RD=null,best=0;for(const r of ROADS){const P=r.prof;if(!P||r.w<10)continue;const e1=Math.hypot(P.ax,P.az),e2=Math.hypot(P.ax+P.ux*P.L,P.az+P.uz*P.L),m=Math.max(e1,e2);if(m>best){best=m;RD=r;}}
  if(RD){const P=RD.prof,outAtEnd=Math.hypot(P.ax+P.ux*P.L,P.az+P.uz*P.L)>Math.hypot(P.ax,P.az),tC=outAtEnd?P.L-45:45,dir=outAtEnd?1:-1;
    const at=t=>[P.ax+P.ux*t,profY(P,P.ax+P.ux*t,P.az+P.uz*t),P.az+P.uz*t];const ang=Math.atan2(P.uz*dir,P.ux*dir),c0=at(tC);STORY.checkpoint=c0;
    push(c0[0],c0[1],c0[2],ang);const hw=RD.w/2;
    for(const [u,side] of [[-7,1],[0,-1],[7,1]])for(let z=-hw+0.8;z<hw-0.8;z+=2.1){if(side*z>hw-3.4)continue;box(u,0,z,0.62,0.82,2.0,JER);climbSolid(0.62,0.82,2.0,0);}
    for(const sg of [-1,1]){const zb=sg*(hw+2.2);for(let row=0;row<4;row++)for(let k=-5;k<=5;k++){const ox=k*0.62+(row%2)*0.31;box(ox,row*0.24,zb,0.6,0.24,0.38,SAND,{});}
      for(let row=0;row<4;row++)for(const ex of [-3.4,3.4])for(let k=0;k<3;k++)box(ex,row*0.24,zb+sg*(0.5+k*0.42),0.38,0.24,0.6,SAND,{});}
    box(2.5,0,hw+5.2,2.4,2.5,2.4,[0.42,0.45,0.4]);box(2.5,1.2,hw+3.98,1.6,0.8,0.04,[0.08,0.09,0.1],{nc:true});box(2.5,2.5,hw+5.2,2.8,0.12,2.8,COL.conD,{nc:true});
    box(-1.5,0,-hw+0.3,0.18,1.2,0.18,COL.steel);push(-1.5,1.05,-hw+0.3,0);for(let k=0;k<7;k++)box(0,0.6+k*0.45*Math.sin(0.35),k*0.8*Math.cos(0.35)+0.4,0.1,0.1,0.8,k%2?WH:RED,{nc:true});pop();
    for(const z of [-hw-1.2,hw+1.2]){box(-10,0,z,0.1,2.3,0.1,COL.steel,{nc:true});box(-10,2.0,z,0.05,0.6,1.1,WH,{nc:true});box(-10.03,2.08,z,0.02,0.18,0.9,RED,{nc:true});}
    pop();barrel(...(()=>{const p=at(tC);return [p[0]-P.uz*(hw+4.5),p[2]+P.ux*(hw+4.5),H(p[0]-P.uz*(hw+4.5),p[2]+P.ux*(hw+4.5))];})());
  }
  // 2) luggage dropped outside street doors
  let lug=0;for(let i=0;i<KD.length&&lug<30;i+=37){const k=KD[i];if(k[7]&1||Math.max(k[8]||0,k[9]||0)<1)continue;if(hs(k[0],k[2],3)>0.5)continue;const c=Math.cos(k[3]),s=Math.sin(k[3]),mx=k[0]+c*(k[4]/2),mz=k[2]+s*(k[4]/2),out=!coveredAt(mx-s*1.2,k[1]+1,mz+c*1.2)?1:!coveredAt(mx+s*1.2,k[1]+1,mz-c*1.2)?-1:0;if(!out)continue;const side=hs(k[0],k[2],9)<0.5?-1:1,x=mx-s*out*2.0+c*side*(k[4]/2+2.6),z=mz+c*out*2.0+s*side*(k[4]/2+2.6),y=H(x,z);if(coveredAt(x,y+1,z)||FOOT.some(f=>f.tag!=='road'&&f.tag!=='prop'&&f.tag!=='ent'&&x>f.x0&&x<f.x1&&z>f.z0&&z<f.z1))continue;
    if(Math.abs(groundAt(x,z,y+1)-y)>0.3)continue;lug++;for(let j=0;j<3+Math.floor(hs(i,j,5)*4);j++){const lx=x+(hs(i,j,1)-0.5)*1.8,lz=z+(hs(j,i,2)-0.5)*1.8,lg=groundAt(lx,lz,y+1);if(Math.abs(lg-y)>0.3)continue;push(lx,lg,lz,hs(i,j,3)*PI);chunk(0.45+hs(i,j,4)*0.35,0.25+hs(j,i,6)*0.25,0.3+hs(i,j,7)*0.2,[[0.3,0.22,0.15],[0.42,0.18,0.15],[0.2,0.24,0.3],[0.33,0.3,0.25]][j%4],{m:MAT.fabric,mat:6});pop();}}
  // 3) the survivors' flat: candles, stove, tins, mattress and blankets in one room near the centre
  let sw=null,bd=1e9;for(const k of KW){if(k[1]<4||k[1]>14)continue;const d=Math.hypot(k[0]+60,k[2]+40);if(d<bd&&FOOT.some(f=>f.tag==='res'&&k[0]>f.x0&&k[0]<f.x1&&k[2]>f.z0&&k[2]<f.z1)){bd=d;sw=k;}}
  if(sw){const c=Math.cos(sw[3]),s=Math.sin(sw[3]),cx=sw[0]+c*sw[4]/2,cz=sw[2]+s*sw[4]/2;let ix=-s,iz=c;const fl=groundAt(cx+ix*1.5,cz+iz*1.5,sw[1]+0.3);if(Math.abs(fl-(sw[1]-0.9))>0.6){ix=s;iz=-c;}
    const f=groundAt(cx+ix*1.5,cz+iz*1.5,sw[1]+0.3),rx=cx+ix*2.0,rz=cz+iz*2.0;STORY.flat=[rx,f,rz];push(rx,f,rz,Math.atan2(iz,ix));
    box(0.4,0,1.0,1.9,0.22,1.3,[0.33,0.3,0.27],{m:MAT.fabric});box(0.6,0.22,1.1,1.3,0.12,1.0,[0.38,0.17,0.13],{nc:true,m:MAT.fabric});box(-0.2,0.22,1.0,0.5,0.14,0.8,[0.55,0.52,0.45],{nc:true,m:MAT.fabric});
    box(-0.9,0,-0.6,0.6,0.42,0.4,[0.4,0.31,0.21],{m:MAT.wood});box(-0.9,0.42,-0.6,0.3,0.12,0.22,[0.18,0.26,0.42],{nc:true});
    for(let k=0;k<7;k++)box(-1.5+(k%3)*0.11,Math.floor(k/3)*0.11,-0.9+(k%2)*0.05,0.09,0.11,0.09,[0.6,0.58,0.5],{nc:true,mat:6});
    for(const [a,b] of [[-0.75,-0.45],[-1.0,-0.5],[0.2,-0.4],[1.2,0.3]])box(a,a<-0.5?0.54:0,b,0.04,0.12,0.04,[1,0.78,0.45],{nc:true,e:true});
    pop();}
  // 4) fire barrels where survivors gather
  if(STORY.flat){const [x,,z]=STORY.flat;for(let r=8;r<40;r+=4){const xx=x+r,g=H(xx,z+3);if(Math.abs(groundAt(xx,z+3,g+1)-g)<0.2&&!FOOT.some(f=>f.tag==='res'&&xx>f.x0-1&&xx<f.x1+1&&z+3>f.z0-1&&z+3<f.z1+1)){barrel(xx,z+3,g);break;}}}
  for(const B of BRIDGES.slice(0,2)){const x=B.rx+B.half-5,z=B.z+B.hw-1.1,g=groundAt(x,z,500);if(g>-1e8)barrel(x,z,g);}
  {const x=60,z=230;barrel(x,z,H(x,z));}
  // 5) saplings on roofs (small pines and dead saplings)
  for(const S of SLABS){const n=Math.floor(hs(S.x,S.z,11)*3);for(let i=0;i<n;i++){const lx=(hs(S.x,i,12)-0.5)*(S.L-6),lz=(hs(i,S.z,13)-0.5)*(S.zf*2-3);if(Math.abs(lx-S.c)<4)continue;const w=toWfrom(S,lx,S.base+S.n*3,lz);TREES.push({x:w[0],y:w[1],z:w[2],type:hs(i,S.x,14)<0.5?0:3,s:0.14+hs(S.z,i,15)*0.16});}}
  // 6) flooded underpasses (standing water over most of the floor)
  for(const [x,z] of [[-440,100],[-90,-260],[200,-260],[-200,100]]){const fy=H(x,z)-4.8;WATER.push({x0:x-12,x1:x+12,z0:z-12,z1:z+11,y:fy+0.09});}
  // 7) crow perches along slab parapets and tower roof edges
  for(const S of SLABS){const c=Math.cos(S.ry),s=Math.sin(S.ry),y=S.base+S.n*3+0.95;for(let lx=-S.L/2+2;lx<S.L/2-2;lx+=5)for(const sz of [-1,1]){const lz=sz*(S.zf-0.12);PERCH.push([S.x+lx*c-lz*s,y,S.z+lx*s+lz*c]);}}
  for(const T of TOWERS){const c=Math.cos(T.ry),s=Math.sin(T.ry),y=T.base+T.n*3+0.95,h=T.h-0.15;for(let t=-h+1;t<h;t+=4)for(const [lx,lz] of [[t,h],[t,-h],[h,t],[-h,t]])PERCH.push([T.x+lx*c-lz*s,y,T.z+lx*s+lz*c]);}
}finally{NORNG=false;}}
function toWfrom(S,lx,y,lz){const c=Math.cos(S.ry),s=Math.sin(S.ry);return [S.x+lx*c-lz*s,y,S.z+lx*s+lz*c];}
// ---------- logic fixes: light wells for buried windows, balconies / steps for doors that open onto nothing, proper dead ends ----------
const LOGIC={wells:0,balconies:0,steps:0,deadEnds:0};
function coveredAt(x,y,z){const L=cellList(x,z);for(const o of L){if(o.ramp||o.y0<y+0.3||o.y0>y+25||o.hx*o.hz<1)continue;const dx=x-o.cx,dz=z-o.cz,u=dx*o.c+dz*o.s,v=-dx*o.s+dz*o.c;if(Math.abs(u)<o.hx&&Math.abs(v)<o.hz)return true;}return false;}
function logicFixes(){NORNG=true;const f0=FLIGHTS.length;try{
  const JER=[0.6,0.59,0.55],WALLC=[0.5,0.49,0.46];
  // 1) light wells: pit in front of buried windows with retaining walls and a grate
  for(const k of KW){const c=Math.cos(k[3]),s=Math.sin(k[3]),W=k[4];const cx=k[0]+c*W/2,cz=k[2]+s*W/2;
    for(const sd of [1,-1]){const nx=-s*sd,nz=c*sd,ox=cx+nx*(k[6]/2+0.35),oz=cz+nz*(k[6]/2+0.35);if(coveredAt(ox,k[1]+1,oz))continue;const gi=Math.floor((ox-TO)/TS),gk=Math.floor((oz-TO)/TS);const g=Math.max(H(ox,oz),H(TO+gi*TS,TO+gk*TS),H(TO+(gi+1)*TS,TO+gk*TS),H(TO+gi*TS,TO+(gk+1)*TS),H(TO+(gi+1)*TS,TO+(gk+1)*TS));if(!(g>k[1]+0.12&&g<k[1]+k[5]+3))continue;
      const fy=k[1]-0.3,d0=k[6]/2,d1=k[6]/2+1.15,hw=W/2+0.35,yaw=Math.atan2(nz,nx);LOGIC.wells++;
      CUTS.push({x0:cx-2.5,x1:cx+2.5,z0:cz-2.5,z1:cz+2.5,fine:true,fn:(px,pz)=>{const dx=px-cx,dz=pz-cz,u=dx*nx+dz*nz,v=-dx*nz+dz*nx;return u>d0-0.05&&u<d1+0.05&&Math.abs(v)<hw+0.05?fy:1e9;}});
      FINE_MARK.push({x0:cx-2.5,x1:cx+2.5,z0:cz-2.5,z1:cz+2.5,f:[cx+nx*d0,cz+nz*d0,fy,cx+nx*d1,cz+nz*d1,fy,hw*2,0]});
      const top=g+0.08,hh=top-fy;push(cx,fy,cz,yaw);box((d0+d1)/2,-0.15,0,d1-d0,0.15,hw*2,COL.conD,{});box(d1+0.08,-0.15,0,0.16,hh+0.15,hw*2+0.32,WALLC,{});
      for(const sg of [-1,1])box((d0+d1)/2+0.04,-0.15,sg*(hw+0.08),d1-d0+0.16,hh+0.15,0.16,WALLC,{});box((d0+d1)/2,0.01,0,0.5,0.03,0.4,COL.dark,{nc:true,mat:6});pop();}}
  // 2) doors that open onto nothing: a balcony when high up, a landing and steps when low
  for(const k of KD){if(k[7]&1)continue;const c=Math.cos(k[3]),s=Math.sin(k[3]),W=k[10]||k[4],cx=k[0]+c*W/2,cz=k[2]+s*W/2;
    for(const sd of [1,-1]){const nx=-s*sd,nz=c*sd,ox=cx+nx*(k[6]/2+0.6),oz=cz+nz*(k[6]/2+0.6);if(coveredAt(ox,k[1]+1,oz))continue;const g=groundAt(ox,oz,k[1]+0.3),drop=k[1]-g;if(!(drop>0.55&&drop<8))continue;
      const yaw=Math.atan2(nz,nx),d0=k[6]/2;push(cx,k[1],cz,yaw);
      if(drop>=2.3){LOGIC.balconies++;const dep=1.2,wid=W+1.2;box(d0+dep/2,-0.2,0,dep,0.2,wid,COL.conL,{});box(d0+dep-0.03,0,0,0.06,1.0,wid,COL.rust,{nc:false});
        for(const sg of [-1,1])box(d0+dep/2,0,sg*(wid/2-0.03),dep,1.0,0.06,COL.rust,{});for(let i=0;i<=8;i++)box(d0+dep-0.03,0.08,-wid/2+i*wid/8,0.02,0.86,0.02,COL.steel,{nc:true,mat:6});pop();}
      else{LOGIC.steps++;pop();const L=Math.max(1.2,drop/0.17*0.28),ax=cx+nx*(d0+1.2),az=cz+nz*(d0+1.2),bx=ax+nx*L,bz=az+nz*L,gb=H(bx,bz);
        push(cx,k[1],cz,yaw);box(d0+0.6,-0.25,0,1.2,0.25,W+0.6,COL.con,{});pop();flight(ax,az,k[1],bx,bz,Math.min(gb,k[1]-0.2),W+0.5,COL.con,'m');}}}
  // 3) dead ends: concrete barriers across the end, a no-through-road sign, a widened turning area
  for(const r of ROADS){const P=r.prof;if(!P)continue;for(const [t,dir] of [[0,-1],[P.L,1]]){const x=P.ax+P.ux*t,z=P.az+P.uz*t;if(Math.abs(x)>555||Math.abs(z)>555)continue;
      const nearRoad=ROADS.some(q=>{if(q===r)return false;const [qa,qb,qc,qd]=q.p,L2=(qc-qa)**2+(qd-qb)**2||1,tt=Math.max(0,Math.min(1,((x-qa)*(qc-qa)+(z-qb)*(qd-qb))/L2));return Math.hypot(x-qa-(qc-qa)*tt,z-qb-(qd-qb)*tt)<q.w/2+r.w/2+4;});
      const nearFeat=FOOT.some(f=>f.tag!=='road'&&x>f.x0-8&&x<f.x1+8&&z>f.z0-8&&z<f.z1+8);if(nearRoad||nearFeat)continue;LOGIC.deadEnds++;
      const ux=P.ux*dir,uz=P.uz*dir,y=profY(P,x,z),ang=Math.atan2(uz,ux);const ex=x+ux*9,ez=z+uz*9,clear=!FOOT.some(f=>ex>f.x0-2&&ex<f.x1+2&&ez>f.z0-2&&ez<f.z1+2)&&!inRiver(ex,ez,4)&&Math.abs(H(ex,ez)-y)<1.2;
      if(clear)flight(x-ux*0.5,z-uz*0.5,y,ex,ez,H(ex,ez)+0.02,r.w+6,COL.asph,false);
      const bx=x+ux*(clear?8:1),bz=z+uz*(clear?8:1),by=clear?H(bx,bz):y;push(bx,by,bz,ang);for(let zz=-r.w/2-2.5;zz<=r.w/2+2.5;zz+=2.1){box(0,0,zz,0.62,0.82,2.0,JER,{});climbSolid(0.62,0.82,2.0,0);}
      box(-1.2,0,r.w/2+3.6,0.08,2.3,0.08,COL.steel,{nc:true});box(-1.22,1.7,r.w/2+3.6,0.04,0.7,0.7,[0.15,0.3,0.6],{nc:true});box(-1.25,1.75,r.w/2+3.6,0.02,0.45,0.12,[0.9,0.9,0.88],{nc:true});box(-1.25,2.05,r.w/2+3.6,0.02,0.12,0.4,[0.75,0.2,0.15],{nc:true});pop();}}
}finally{NORNG=false;}flightRails(f0,FLIGHTS.length);}
const PLINTH=new Set();
function sealBuriedWindows(){NORNG=true;let n=0,pl=0;try{for(let i=KW.length-1;i>=0;i--){const k=KW[i],c=Math.cos(k[3]),s=Math.sin(k[3]),W=k[4],cx=k[0]+c*W/2,cz=k[2]+s*W/2;
    for(const sd of [1,-1]){const nx=-s*sd,nz=c*sd,ox=cx+nx*(k[6]/2+0.35),oz=cz+nz*(k[6]/2+0.35);const g=Math.max(meshH(ox,oz),meshH(cx+nx*(k[6]/2+0.15),cz+nz*(k[6]/2+0.15)));
      if(g-k[1]>0.12&&g-k[1]<=1.4&&!coveredAt(ox,k[1]+1,oz)){const hh=g-k[1]+0.12;push(cx,k[1]-0.3,cz,Math.atan2(nz,nx));box(k[6]/2+0.2,0,0,0.4,hh+0.3,W+0.3,COL.conD,{});box(k[6]/2+0.2,hh+0.3,0,0.46,0.06,W+0.4,COL.con,{});pop();PLINTH.add(i);pl++;break;}
      if(g-k[1]>1.4&&g<k[1]+k[5]+4&&!coveredAt(ox,k[1]+1,oz)){
      push(cx,k[1],cz,Math.atan2(nz,nx));box(0,0,0,k[6]*0.9,k[5],W,COL.brick,{flat:true});pop();KW.splice(i,1);n++;break;}}}}finally{NORNG=false;}LOGIC.sealed=n;LOGIC.plinths=pl;}
// ---------- street and facade detail: manholes, kerb drains, yellow gas pipes, junction boxes ----------
const SDET={manholes:0,drains:0,pipes:0,boxes:0};
function streetDetail(){NORNG=true;try{const IRON=[0.17,0.16,0.15],GAS=[0.74,0.6,0.16],BOXC=[0.42,0.45,0.42],D6={nc:true,mat:6};
  for(const r of ROADS){const P=r.prof;if(!P)continue;for(let t=20,k=0;t<P.L-10;t+=55,k++){const fi=Math.round(t/P.step);if(P.tun&&P.tun[fi])continue;const off=(k%2?1:-1)*r.w/4,x=P.ax+P.ux*t-P.uz*off,z=P.az+P.uz*t+P.ux*off,y=profY(P,x,z)+0.012,a=Math.atan2(P.uz,P.ux);
      push(x,y,z,a);box(0,0,0,0.72,0.02,0.72,IRON,D6);push(0,0,0,Math.PI/4);box(0,0,0,0.72,0.02,0.72,IRON,D6);pop();box(0,0.02,0,0.5,0.004,0.06,[0.1,0.1,0.1],D6);pop();SDET.manholes++;}
    for(let t=12;t<P.L-6;t+=40){const fi=Math.round(t/P.step);if(P.tun&&P.tun[fi])continue;for(const sd of [-1,1]){const off=sd*(r.w/2-0.32),x=P.ax+P.ux*t-P.uz*off,z=P.az+P.uz*t+P.ux*off,y=profY(P,x,z)+0.01;
      push(x,y,z,Math.atan2(P.uz,P.ux));box(0,0,0,0.9,0.02,0.45,IRON,D6);for(let i=-3;i<=3;i++)box(i*0.12,0.02,0,0.04,0.004,0.36,[0.06,0.06,0.06],D6);pop();SDET.drains++;}}}
  // zebra crossings across each road just outside every junction (faded paint)
  SDET.crossings=0;{const PAINT=[0.78,0.78,0.74],seen=new Set();for(const A of ROADS){const P=A.prof;if(!P)continue;for(const B of ROADS){if(B===A||!B.prof)continue;const [bx0,bz0,bx1,bz1]=B.p;
      const dx=bx1-bx0,dz=bz1-bz0,den=P.ux*dz-P.uz*dx;if(Math.abs(den)<1e-6)continue;const t=((bx0-P.ax)*dz-(bz0-P.az)*dx)/den,u=((bx0-P.ax)*P.uz-(bz0-P.az)*P.ux)/den;if(t<-1||t>P.L+1||u<-0.02||u>1.02)continue;
      for(const sg of [-1,1]){const tc=t+sg*(B.w/2+3.6+1.8);if(tc<2||tc>P.L-2)continue;const fi=Math.round(tc/P.step);if(P.tun&&P.tun[fi])continue;const key=Math.round(P.ax+P.ux*tc)+','+Math.round(P.az+P.uz*tc);if(seen.has(key))continue;seen.add(key);
        const cx=P.ax+P.ux*tc,cz=P.az+P.uz*tc,y=profY(P,cx,cz)+0.012;push(cx,y,cz,Math.atan2(P.uz,P.ux));for(let v=-A.w/2+0.8;v<=A.w/2-0.8;v+=1.0)box(0,0,v,3.0,0.01,0.5,PAINT,{nc:true,mat:6});pop();SDET.crossings++;}}}}
  // Soviet concrete bus shelters on avenues, midway between lamp posts, away from junctions and doors
  SDET.stops=0;for(const r of ROADS){const P=r.prof;if(!P||r.w<12)continue;let last=-999;for(let t=34*3;t<P.L-30;t+=34){if(t-last<230)continue;const fi=Math.round(t/P.step);if(P.tun&&P.tun[fi])continue;const sd=(Math.round(t/34)%2)?-1:1,off=r.w/2+2.0,cx=P.ax+P.ux*t,cz=P.az+P.uz*t,x=cx-P.uz*sd*off,z=cz+P.ux*sd*off;
      if(inOtherRoad(x,z,r)||FOOT.some(f=>f.tag!=='road'&&x>f.x0-1.5&&x<f.x1+1.5&&z>f.z0-1.5&&z<f.z1+1.5))continue;if(KD.some(k=>Math.hypot(k[0]-x,k[2]-z)<9&&Math.abs(k[1]-H(x,z))<2))continue;
      const y=groundAt(x,z,profY(P,cx,cz)+1.5);if(y<-1e8)continue;push(x,y,z,Math.atan2(P.uz,P.ux)+(sd>0?0:PI));
      box(0,0,0.75,4.2,2.5,0.14,COL.conL,{});for(const e of [-2.05,2.05])box(e,0,0.15,0.12,2.5,1.3,COL.conL,{});box(0,2.5,0.05,4.6,0.18,1.8,COL.con,{});box(0,0.42,0.45,3.6,0.08,0.4,COL.wood,{});box(0,0,0.45,3.4,0.42,0.12,COL.con,{});
      box(2.6,0,-0.5,0.08,2.6,0.08,COL.steel,{nc:true});box(2.6,2.3,-0.5,0.04,0.5,0.5,[0.85,0.8,0.25],{nc:true});pop();SDET.stops++;last=t;}}
  // concrete street lamps every 34 m, alternating sides, at the outer edge of the pavement (unlit: no power)
  SDET.lamps=0;for(const r of ROADS){const P=r.prof;if(!P||r.nf)continue;let k=0;for(let t=17;t<P.L-12;t+=34,k++){const fi=Math.round(t/P.step);if(P.tun&&P.tun[fi])continue;const sd=k%2?1:-1,off=r.w/2+2.8,cx=P.ax+P.ux*t,cz=P.az+P.uz*t,x=cx-P.uz*sd*off,z=cz+P.ux*sd*off;
      if(inOtherRoad(x,z,r)||FOOT.some(f=>f.tag!=='road'&&x>f.x0-0.5&&x<f.x1+0.5&&z>f.z0-0.5&&z<f.z1+0.5)||inRiver(x,z,3))continue;const y=groundAt(x,z,profY(P,cx,cz)+1.5),ang=Math.atan2(P.ux*sd,-P.uz*sd);if(y<-1e8)continue;
      push(x,y,z,ang+PI);box(0,-0.4,0,0.26,8.6,0.26,COL.con,{});box(0.75,7.9,0,1.6,0.14,0.14,COL.con,{nc:true});box(1.5,7.62,0,0.6,0.22,0.3,[0.3,0.31,0.3],{nc:true});box(1.5,7.6,0,0.5,0.03,0.24,[0.55,0.57,0.55],{nc:true});pop();SDET.lamps++;}}
  for(const S of SLABS){const y=2.45,zf=S.zf+0.2;push(S.x,S.base,S.z,S.ry);beamL([-S.L/2+0.6,y,zf],[S.L/2-0.6,y,zf],0.1,0.1,GAS,{nc:true});
    for(let x=-S.L/2+1;x<S.L/2;x+=3)box(x,y-0.12,S.zf+0.1,0.05,0.12,0.2,COL.steel,D6);beamL([S.c+2.4,0.4,zf],[S.c+2.4,y,zf],0.08,0.08,GAS,{nc:true});box(S.c+2.4,0.9,zf+0.02,0.18,0.12,0.18,COL.steel,D6);pop();SDET.pipes++;}
  for(const k of KD){if(SDET.boxes>=400)break;if(k[7]&1)continue;const out=Math.max(k[8]||0,k[9]||0);if(out<1)continue;const c=Math.cos(k[3]),s=Math.sin(k[3]),W=k[10]||k[4],cx=k[0]+c*W/2,cz=k[2]+s*W/2;
    if(Math.abs(groundAt(cx,cz,k[1]+0.3)-k[1])>0.3)continue;if(!FOOT.some(f=>f.tag==='res'&&cx>f.x0&&cx<f.x1&&cz>f.z0&&cz<f.z1))continue;
    for(const sd of [1,-1]){const nx=-s*sd,nz=c*sd,ox=cx+nx*(k[6]/2+0.5),oz=cz+nz*(k[6]/2+0.5);if(coveredAt(ox,k[1]+1,oz))continue;
      const bx=cx+c*(W/2+0.9)+nx*(k[6]/2+0.12),bz=cz+s*(W/2+0.9)+nz*(k[6]/2+0.12);push(bx,k[1],bz,Math.atan2(nz,nx));box(0,1.0,0,0.22,0.72,0.5,BOXC,{});box(0.12,1.25,0.12,0.02,0.06,0.06,[0.6,0.12,0.1],D6);box(0,1.72,0,0.05,1.3,0.05,COL.dark,{nc:true});pop();SDET.boxes++;break;}}
}finally{NORNG=false;}}
function facadeKit(){liftLandingCleanup();blastHoles();storyProps();logicFixes();streetDetail();BRICKED=brickUpBlockedDoors();roofScape();NORNG=true;try{
  const JOINT=[0.26,0.26,0.25],PLINTH=[0.34,0.33,0.31],COPE=[0.62,0.61,0.58],CAN=[0.55,0.54,0.51];
  const blds=[];for(const S of SLABS)blds.push({x:S.x,z:S.z,ry:S.ry,base:S.base,n:S.n,hx:S.L/2,hz:S.zf,slab:true});
  for(const T of TOWERS)blds.push({x:T.x,z:T.z,ry:T.ry,base:T.base,n:T.n,hx:(T.S||24)/2,hz:(T.S||24)/2,slab:false});
  for(const Hl of HALLS){const n=Math.max(1,Math.round(Hl.h/3));blds.push({x:Hl.x,z:Hl.z,ry:Hl.ry,base:Hl.base,n,fh:Hl.h/n,hx:Hl.L/2,hz:Hl.W/2,slab:false,hall:true,h:Hl.h});}
  const grid=new Map(),gk=(x,z)=>Math.floor(x/24)*10007+Math.floor(z/24);
  const addG=(k,kind)=>{const key=gk(k[0],k[2]);let L=grid.get(key);if(!L){L=[];grid.set(key,L);}L.push([kind,k]);};
  for(const k of KW)addG(k,'w');for(const k of KD)if(!(k[7]&1))addG(k,'d');
  for(const B of blds){const c=Math.cos(B.ry),s=Math.sin(B.ry),FHb=B.fh||3,Hh=B.n*FHb,top=B.base+Hh;
    const loc=(wx,wz)=>{const dx=wx-B.x,dz=wz-B.z;return [dx*c+dz*s,-dx*s+dz*c];};
    // openings on each of the four faces, in local face coordinates
    const faces=[{n:'f',along:'x',off:B.hz,len:B.hx},{n:'b',along:'x',off:-B.hz,len:B.hx},{n:'r',along:'z',off:B.hx,len:B.hz},{n:'l',along:'z',off:-B.hx,len:B.hz}];
    for(const F2 of faces)F2.ops=[];
    const r=Math.hypot(B.hx,B.hz)+2,ci0=Math.floor((B.x-r)/24),ci1=Math.floor((B.x+r)/24),ck0=Math.floor((B.z-r)/24),ck1=Math.floor((B.z+r)/24);
    for(let i=ci0;i<=ci1;i++)for(let k=ck0;k<=ck1;k++){const L=grid.get(i*10007+k);if(!L)continue;for(const [kind,o] of L){if(o[1]<B.base-0.6||o[1]>top+0.5)continue;
      let wx=o[0],wz=o[2],W=o[4];if(kind==='d'){const cc=Math.cos(o[3]),ss=Math.sin(o[3]);W=o[10]||o[4];wx+=cc*W/2;wz+=ss*W/2;}
      const [lx,lz]=loc(wx,wz);
      for(const F2 of faces){const onPlane=F2.along==='x'?Math.abs(lz-F2.off)<0.45:Math.abs(lx-F2.off)<0.45;if(!onPlane)continue;const u=F2.along==='x'?lx:lz;if(Math.abs(u)>F2.len+0.2)continue;
        F2.ops.push({u0:u-W/2-0.08,u1:u+W/2+0.08,y0:o[1],y1:o[1]+o[5],door:kind==='d',ground:Math.abs(o[1]-B.base)<0.5});}}}
    push(B.x,B.base,B.z,B.ry);
    for(const F2 of faces){const sgn=Math.sign(F2.off),out=Math.abs(F2.off)+0.012;
      const put=(u,y,len,h,dep,col,o)=>{if(F2.along==='x')box(u,y,sgn*(out+dep/2-0.01),len,h,dep,col,o);else box(sgn*(out+dep/2-0.01),y,u,dep,h,len,col,o);};
      // horizontal joints at every floor line
      for(let f=1;f<B.n;f++)put(0,f*FHb-0.03,F2.len*2,0.06,0.03,JOINT,{nc:true});
      // vertical joints midway between window columns, never crossing an opening
      const cols=[];for(const o of F2.ops){if(o.door&&o.ground)continue;if(!cols.some(cn=>Math.abs(cn.u0-o.u0)<0.3))cols.push({u0:o.u0,u1:o.u1});}
      cols.sort((a,b)=>a.u0-b.u0);
      const cand=[];for(let i=0;i+1<cols.length;i++){const g0=cols[i].u1,g1=cols[i+1].u0;if(g1-g0>0.5)cand.push((g0+g1)/2);}
      if(!cols.length)for(let u=-F2.len+3;u<F2.len-1;u+=3)cand.push(u);
      for(const u of cand){if(Math.abs(u)>F2.len-0.4)continue;if(F2.ops.some(o=>!o.ground&&u>o.u0&&u<o.u1))continue;
        const blockG=F2.ops.some(o=>o.ground&&u>o.u0-0.1&&u<o.u1+0.1);const y0=blockG?(B.hall?Math.max(...F2.ops.filter(o=>o.ground&&u>o.u0-0.1&&u<o.u1+0.1).map(o=>o.y1-B.base))+0.1:3):0;if(y0<Hh-0.3)put(u,y0,0.06,Hh-y0,0.03,JOINT,{nc:true});}
      if(B.hall){put(0,Hh-0.25,F2.len*2+0.2,0.3,0.12,COPE,{nc:true});for(const u of [-F2.len+0.4,F2.len-0.4,0]){if(F2.ops.some(o=>u>o.u0-0.3&&u<o.u1+0.3))continue;put(u,-0.3,0.14,Hh+0.1,0.14,[0.3,0.3,0.3],{nc:true,m:MAT.steel});}}
      // plinth course: dark base band from below grade to floor level
      put(0,-1.4,F2.len*2+0.12,1.42,0.06,PLINTH,{nc:true});
      // entrance canopies over ground-floor street doors
      for(const o of F2.ops){if(!o.door||!o.ground)continue;const wd=o.u1-o.u0+1.0,uc=(o.u0+o.u1)/2,yc=Math.min(B.hall?3.4:2.75,o.y1-B.base+0.28);
        put(uc,yc,wd,0.16,1.45,CAN,{});put(uc,yc-0.06,wd,0.06,0.06,JOINT,{nc:true});
        if(F2.along==='x'){box(uc,yc+0.16,sgn*(out+1.42),wd,0.08,0.06,CAN,{nc:true});box(uc,yc-0.08,sgn*(out+0.35),0.28,0.07,0.16,COL.lamp,{nc:true,e:true});}
        else{box(sgn*(out+1.42),yc+0.16,uc,0.06,0.08,wd,CAN,{nc:true});box(sgn*(out+0.35),yc-0.08,uc,0.16,0.07,0.28,COL.lamp,{nc:true,e:true});}}
    }
    // parapet coping on slab roofs
    if(B.slab){const yr=Hh+0.9;for(const sz of [-1,1])box(0,yr,sz*(B.hz-0.12),B.hx*2+0.12,0.08,0.42,COPE,{nc:true});for(const sx of [-1,1])box(sx*(B.hx-0.12),yr,0,0.42,0.08,B.hz*2+0.12,COPE,{nc:true});}
    pop();}
}finally{NORNG=false;}}
// ---------- towers on sloping ground get a stair from the entrance down to the terrain ----------
function towerEntranceStairs(){NORNG=true;try{
  for(const T of TOWERS){const h=(T.S||24)/2,c=Math.cos(T.ry),s=Math.sin(T.ry),W=(lx,lz)=>[T.x+lx*c-lz*s,T.z+lx*s+lz*c];
    let gmin=1e9;for(let tt=1.2;tt<=4.2;tt+=0.5){const q=W(1.5,h+tt);gmin=Math.min(gmin,H(q[0],q[1]));}if(gmin>T.base-0.45)continue;
    let t0=1.2;for(let tt=1.2;tt<=6;tt+=0.25){const q=W(1.5,h+tt);if(H(q[0],q[1])<T.base-0.3){t0=Math.max(1.2,tt-0.4);break;}}
    const clear=q=>!footNear(q[0],q[1]).some(f=>f.tag!=='road'&&f.tag!=='prop'&&q[0]>f.x0-0.5&&q[0]<f.x1+0.5&&q[1]>f.z0-0.5&&q[1]<f.z1+0.5&&!(Math.abs((f.x0+f.x1)/2-T.x)<0.5&&Math.abs((f.z0+f.z1)/2-T.z)<0.5));
    // candidate routes: straight out, or along the facade from a landing at the terrace edge
    const routes=[{land:t0,sx:1.5,sz:h+t0,dx:0,dz:1},{land:t0+1.4,sx:1.5,sz:h+t0+1.4,dx:1,dz:0},{land:t0+1.4,sx:1.5,sz:h+t0+1.4,dx:-1,dz:0}];
    let pick=null;
    for(const r of routes){let end=null,ok=true;for(let t=0.5;t<=18;t+=0.5){const lx=r.sx+r.dx*t,lz=r.sz+r.dz*t,q=W(lx,lz),g=H(q[0],q[1]),y=T.base-t*0.6;
        if(r.dz===0&&Math.abs(lx)>h+6){ok=false;break;}
        if(y<=g+0.05){end={t,y:Math.max(g,y),lx,lz};break;}}
      if(!ok||!end)continue;if(!clear(W(end.lx,end.lz))||!clear(W(r.sx+r.dx*end.t*0.5,r.sz+r.dz*end.t*0.5)))continue;pick={r,end};break;}
    if(!pick)continue;const {r,end}=pick;
    const a=W(1.5,h+0.05),b=W(1.5,h+r.land);flight(a[0],a[1],T.base,b[0],b[1],T.base,2.6,COL.conL,false);
    if(r.dz===0){const e=W(1.5+r.dx*1.3,h+r.land);flight(b[0],b[1],T.base,e[0],e[1],T.base,2.6,COL.conL,false);}
    const st=r.dz===0?W(r.sx+r.dx*1.3,r.sz):b,en=W(end.lx,end.lz);flight(st[0],st[1],T.base,en[0],en[1],end.y,2.4,COL.conL,true);
    {const ax=st[0],az=st[1],bx=en[0],bz=en[1],ya=T.base,yb=end.y,L=Math.hypot(bx-ax,bz-az)||1,ux=(bx-ax)/L,uz=(bz-az)/L,m=2.8;
     CUTS.push({x0:Math.min(ax,bx)-m,x1:Math.max(ax,bx)+m,z0:Math.min(az,bz)-m,z1:Math.max(az,bz)+m,fine:true,fn:(px,pz)=>{const t=(px-ax)*ux+(pz-az)*uz;if(t<-0.3||t>L+0.3||Math.abs(-(px-ax)*uz+(pz-az)*ux)>m)return 1e9;return ya+(yb-ya)*Math.max(0,Math.min(L,t))/L-0.32;}});
     FINE_MARK.push({x0:Math.min(ax,bx)-m,x1:Math.max(ax,bx)+m,z0:Math.min(az,bz)-m,z1:Math.max(az,bz)+m,f:[ax,az,ya,bx,bz,yb,2.4,1]});}
    const side=(lx,lz,ox,oz)=>W(lx+ox,lz+oz),px=r.dz===0?0:1.3,pz=r.dz===0?1.3:0;
    for(const sd of [-1,1]){const p0=side(r.sx,r.sz,px*sd,pz*sd),p1=side(end.lx,end.lz,px*sd,pz*sd);beamL([p0[0],T.base+1.0,p0[1]],[p1[0],end.y+1.0,p1[1]],0.05,0.05,COL.rust,{nc:true,flat:true});}
    // support columns under the landing and the flight
    const col=(lx,lz,top)=>{const q=W(lx,lz),g=H(q[0],q[1]);if(top-g>0.6)box(q[0],g-0.3,q[1],0.35,top-g+0.05,0.35,COL.con,{flat:true});};
    for(let t=0.6;t<=r.land;t+=2.5)for(const sd of [-1,1])col(1.5+sd*1.1,h+t,T.base-0.3);
    for(let t=2;t<end.t;t+=3)col(r.sx+r.dx*t,r.sz+r.dz*t,T.base-t*0.6-0.4);
  }
}finally{NORNG=false;}}
// ================= BUILD =================
const WGC={res:()=>FOOT.filter(f=>f.tag==='res').length,tow:()=>FOOT.filter(f=>f.tag==='tower').length,resT:120,towT:90};
function* buildWorldGen(progress,opts){
  const P=m=>{if(progress)progress(m);return m;};
  setupCuts();
  yield P('Engineering roads');reserveRoads();computeRoadProfiles();
  if(CMPT){
    yield P('Raising Tower 245');tower245();
    yield P('Civic centre');adminBuilding();univermag();townSquare();
    yield P('School');school();
    yield P('Safe house');safeHouse();
    yield P('Deep metro loop');compactMetro();
    yield P('Amenities');{const Q=[[-392,0,-392,0],[0,392,-392,0],[-392,0,0,392],[0,392,0,392]];civicFill([].concat(Q.map(q=>['kinder',q]),Q.map(q=>['shop',q]),[['boiler',Q[0]],['boiler',Q[3]],['canteen',Q[1]],['post',Q[2]],['mil',Q[0]],['cinema',Q[3]]]));}
    yield P('Industry');hall({x:356,z:-100,ry:HP,len:60,span:24,h:12,roof:'saw'});hall({x:356,z:-20,ry:HP,len:60,span:24,h:10,roof:'flat'});hall({x:356,z:60,ry:HP,len:60,span:24,h:12,roof:'saw'});
    // dense blocks between the roads: courtyard clusters first, then tight fills of taller types to the same targets
    const xs=[-392,-300,-230,-160,-80,72,210,265,320,392],zs=[-392,-320,-215,-150,110,170,230,300,392],blocks=[];
    for(let i=0;i+1<xs.length;i++)for(let j=0;j+1<zs.length;j++)blocks.push({x0:xs[i]+11,x1:xs[i+1]-11,z0:zs[j]+11,z1:zs[j+1]-11});
    yield P('Courtyard blocks');for(const b of blocks)if(b.x1-b.x0>60&&b.z1-b.z0>60&&chance(0.45))kvartal(b,1);
    yield P('Packing the blocks');const pal=[COL.teal,COL.green,COL.blue,COL.ochre];let k=0;
    for(let pass=0;pass<3;pass++)for(const b of blocks){if(WGC.res()>=WGC.resT&&WGC.tow()>=WGC.towT)break;const r=Object.assign({scan:1,tight:1,types:pass<1?['s14','s14','s9','t22','t16']:['s14','t22','t16']},b);fillRes(r,60,pal[k++%4]);}
    yield P('Courtyards');for(const b of blocks)props(b,6);
  }else{
  reserve({x0:-513,x1:-497,z0:-372,z1:-279},'ent');reserve({x0:-10,x1:82,z0:-326,z1:-314},'ent');reserve({x0:-10,x1:82,z0:314,z1:326},'ent');reserve({x0:-512,x1:-430,z0:-502,z1:-432},'ent');reserve({x0:394,x1:508,z0:-328,z1:-246},'ent');
  yield P('Raising Tower 245');tower245();
  yield P('Civic centre');adminBuilding();univermag();townSquare();
  yield P('School and hospital');school();hospital();
  yield P('Subway and shelters');subway();
  yield P('Dam and bridges');dam();bridges();for(const z of BRIDGE_Z)roadBridge(z,z===300?12:14);highway();
  yield P('Industry');railway();depot();
  hall({x:460,z:40,ry:HP,len:180,span:40,h:30,roof:'flat',levels:[8,15,22],machines:0,turbines:true,wall:COL.brick});
  hall({x:340,z:30,ry:0,len:50,span:50,h:34,roof:'flat',reactor:true,machines:0,opasno:true,catwalk:false,wall:COL.con});
  hall({x:290,z:-55,ry:HP,len:84,span:30,h:12,roof:'saw'});
  hall({x:340,z:-190,ry:0,len:72,span:24,h:10,roof:'flat'});
  hall({x:430,z:290,ry:0,len:90,span:30,h:12});
  hall({x:255,z:250,ry:HP,len:60,span:24,h:10,roof:'saw'});
  hall({x:330,z:430,ry:0,len:60,span:24,h:10,roof:'saw'});
  hall({x:250,z:-170,ry:HP,len:60,span:24,h:12});
  hall({x:470,z:-80,ry:0,len:72,span:24,h:12,roof:'saw'});
  chimney(510,0,true);chimney(510,80,false);waterTower(250,40);
  pipeLine([[440,150],[225,150],[225,-60],[150,-62]]);pipeLine([[410,-60],[410,-370],[150,-370]]);
  radioMast();
  yield P('Central district');
  terrace({x:-240,z:-150,ry:HP,len:48,depth:18,floors:6});terrace({x:-240,z:250,ry:HP,len:48,depth:18,floors:5});terrace({x:-240,z:-30,ry:HP,len:42,depth:15,floors:5});
  yield P('South edge');collapsedTower();amusement();marketSquare();houseOfCulture();pylons();
  frameBld({x:160,z:470,ry:0,nx:4,nz:2,floors:9});frameBld({x:300,z:520,ry:HP,nx:3,nz:2,floors:6});
  coolingTower(480,-185);coolingTower(320,310);
  gateBuilding(-90,-330,0,24);gateBuilding(-520,100,HP,24);
  yield P('Safe house');safeHouse();
  yield P('West residential');
  resSlab({x:-500,z:210,ry:-HP,len:168,depth:15,floors:12,detail:1,sec:24,damage:0.2,paint:COL.teal,num:1});
  BNUM=20;
  kvartal({x0:-560,x1:-330,z0:-440,z1:560},5);kvartal({x0:-190,x1:195,z0:205,z1:365},1);kvartal({x0:-140,x1:430,z0:-460,z1:-210},1);
  yield P('Civic buildings');civicFill();
  yield P('Street frontage');frontage();
  fillRes({x0:-560,x1:-330,z0:-440,z1:560},34,COL.teal);
  fillRes({x0:-140,x1:430,z0:-460,z1:-210},16,COL.green);
  fillRes({x0:-190,x1:190,z0:-200,z1:195},10,COL.blue);
  fillRes({x0:-190,x1:195,z0:205,z1:560},10,COL.ochre);fillRes({x0:205,x1:440,z0:395,z1:560},5,COL.ochre);
  fillRes({x0:-280,x1:-205,z0:-400,z1:560},10,COL.ochre);fillRes({x0:-140,x1:295,z0:-555,z1:-450},8,COL.green);kvartal({x0:-140,x1:295,z0:-555,z1:-440},1);
  yield P('Packing the blocks');
  for(const [r,p] of [[{x0:-560,x1:-330,z0:-440,z1:560,scan:1},COL.teal],[{x0:-140,x1:430,z0:-460,z1:-210,scan:1},COL.green],[{x0:-190,x1:190,z0:-200,z1:195,scan:1},COL.blue],[{x0:-190,x1:195,z0:205,z1:560,scan:1},COL.ochre],[{x0:205,x1:440,z0:395,z1:560,scan:1},COL.ochre],[{x0:-285,x1:-205,z0:-400,z1:560,scan:1},COL.ochre],[{x0:-140,x1:295,z0:-555,z1:-450,scan:1},COL.green]]){
    if(WGC.res()>=WGC.resT&&WGC.tow()>=WGC.towT)break;r.tight=1;r.types=['k5','k5','s9','t16','t16','t22'];fillRes(r,400,p);}
  // workshops on the north edge by the depot and along the river
  {const rr={x0:300,x1:430,z0:-560,z1:-390};let c=0;for(let t=0;t<3000&&c<8;t++){const x=rnd(rr.x0,rr.x1),z=rnd(rr.z0,rr.z1),ry=pick([0,HP]),len=pick([24,30,36]),span=pick([12,18]);const a=footAABB(x,z,len+4,span+4,ry);if(a.x0<rr.x0||a.x1>rr.x1||a.z0<rr.z0||a.z1>rr.z1||overlaps(a,3))continue;const gb=groundBase(x,z,len,span,ry);if(gb.top-gb.bot>4)continue;hall({x,z,ry,len,span,h:pick([6,8]),roof:chance(0.5)?'saw':'flat',catwalk:false,machines:1});c++;}}
  yield P('Cranes and chimneys');
  for(const [fx,fz,fry,L,D,fl] of FRAMES){const c=Math.cos(fry),sn=Math.sin(fry),ox=L/2+5,cx=fx+ox*c,cz=fz+ox*sn;if(!overlaps({x0:cx-3,x1:cx+3,z0:cz-3,z1:cz+3},1)){reserve({x0:cx-3,x1:cx+3,z0:cz-3,z1:cz+3},'prop');towerCrane(cx,cz,fl*3+16,rnd(28,42),rnd(0,PI*2));}}
  gantryCrane(485,440,64,8);gantryCrane(485,515,64,8);
  for(const [x,z] of [[240,70],[240,-30],[420,-130],[380,250],[230,330]])chimneyAt(x,z,pick([48,56,64]),pick([COL.brick,COL.brick,COL.con]));
  cliffLookout();
  yield P('Courtyards');
  props({x0:-560,x1:-330,z0:-440,z1:560},110);props({x0:-140,x1:430,z0:-460,z1:-210},45);props({x0:-190,x1:195,z0:-200,z1:560},50);props({x0:205,x1:440,z0:395,z1:560},15);props({x0:-140,x1:295,z0:-555,z1:-450},20);
  industryFill();riverWorks();
  yield P('Deep underground');deepUnderground();
  }
  yield P('Paving roads and tunnels');buildRoads();spiralRoads();pavingFill();APRONS=frontageAprons();const fr0=FLIGHTS.length;for(const e of ENTR)e();const fr1=FLIGHTS.length;utilityPoles();const fr2=FLIGHTS.length;towerEntranceStairs();const fr3=FLIGHTS.length;flightRails(fr0,fr1);flightRails(fr2,fr3);facadeKit();CLEARED=flightClearance();
  yield P('Clearing ground from stairs');
  CUTS.push({x0:-395,x1:-205,z0:-458,z1:-436,y:-6});
  const inPad=(x,z)=>{const L=BP_GRID.get(Math.floor(x/BP_C)*10007+Math.floor(z/BP_C));if(!L)return false;for(const p of L)if(x>p.x0&&x<p.x1&&z>p.z0&&z<p.z1)return true;return false;};
  for(const f of FLIGHTS){const [ax,az,ya,bx,bz,yb,w]=f;const L=Math.hypot(bx-ax,bz-az)||1,ux=(bx-ax)/L,uz=(bz-az)/L;
    {const lo=Math.min(ya,yb),hi=Math.max(ya,yb),hm=baseH((ax+bx)/2,(az+bz)/2);if(hm>hi+40||hm<lo-25)continue;}
    const ipd=inPad((ax+bx)/2,(az+bz)/2);
    let near=false,hit=false;
    for(let s=0;s<=L;s+=0.5)for(const off of [0,-(w/2),(w/2)]){const x=ax+ux*s-uz*off,z=az+uz*s+ux*off,y=ya+(yb-ya)*s/L,h=H(x,z);if(h>y-0.8&&h<y+2.6)near=true;if(h>y+0.02&&h<y+2.6)hit=true;}
    if(!near||(ipd&&!hit))continue;const m=w/2+0.4;
    if(!f[7]&&!hit){const mx=(ax+bx)/2,mz=(az+bz)/2,my=(ya+yb)/2;let flat=true;for(const sd of [-1,1]){const h=H(mx-uz*sd*(w/2+6),mz+ux*sd*(w/2+6));if(Math.abs(h-my)>0.4)flat=false;}if(flat)continue;}
    FINE_MARK.push({x0:Math.min(ax,bx)-m,x1:Math.max(ax,bx)+m,z0:Math.min(az,bz)-m,z1:Math.max(az,bz)+m,f});
    if(!hit)continue;
    CUTS.push({x0:Math.min(ax,bx)-m-0.5,x1:Math.max(ax,bx)+m+0.5,z0:Math.min(az,bz)-m-0.5,z1:Math.max(az,bz)+m+0.5,fn:(px,pz,h)=>{const t=(px-ax)*ux+(pz-az)*uz;if(t<-0.4||t>L+0.4||Math.abs(-(px-ax)*uz+(pz-az)*ux)>m)return 1e9;const y=ya+(yb-ya)*clamp(t,0,L)/L;return (h>y-0.3&&h<y+2.6)?y-0.3:1e9;},fine:true});}
  yield P('Shaping the land');const TER=buildTerrain();sealBuriedWindows();
  {const sp=UNDER.find(u=>u[0]==="Survivors' flat");if(sp&&STORY.flat){sp[1]=STORY.flat[0];sp[2]=STORY.flat[1];sp[3]=STORY.flat[2];}}
  PLACES_FIXED=fixPlaces();if(!CMPT)placeBreaker();
  if(opts&&opts.defer){DEFER={phase:'bake',order:null,i:0};return {terrain:TER,trees:new Map(),stats:STATS,deferred:true};}
  yield P('Lighting');bakeLight();makeDecals();
  yield P('Planting the forest');plantTrees();plantSaplings();farCity();
  return {terrain:TER,trees:TREE_B,stats:STATS};
}
// every underground place must stand on real floor with head room; search nearby if the stored point has none
function fixPlaces(){const solid=(x,y,z)=>{for(const o of cellList(x,z)){if(o.ramp||y<o.y0||y>o.y1)continue;const dx=x-o.cx,dz=z-o.cz,u=dx*o.c+dz*o.s,v=-dx*o.s+dz*o.c;if(Math.abs(u)<=o.hx&&Math.abs(v)<=o.hz)return true;}return false;};
  const ok=(x,y,z)=>{const g=groundAt(x,z,y+1.5);if(g<y-3||g>y+1.5)return null;if(solid(x,g+0.9,z)||solid(x,g+1.7,z))return null;return g;};
  let moved=0;for(const p of UNDER){const [,x,y,z]=p;let best=null;
    for(let r=0;r<=7&&!best;r+=0.5)for(let a=0;a<(r===0?1:Math.ceil(r*6));a++){const an=a/Math.max(1,Math.ceil(r*6))*Math.PI*2,px=x+Math.cos(an)*r,pz=z+Math.sin(an)*r,g=ok(px,y,pz);if(g!==null){best=[px,g,pz];break;}}
    if(best){if(Math.hypot(best[0]-x,best[2]-z)>0.01||Math.abs(best[1]-y)>0.05)moved++;p[1]=best[0];p[2]=best[1];p[3]=best[2];}}
  return moved;}
let PLACES_FIXED=0;
function buildWorld(progress,opts){const g=buildWorldGen(progress,opts);let r=g.next();while(!r.done)r=g.next();return r.value;}
// finishing work done after the city is on screen: lighting nearest-first, then decals, forest and skyline
let DEFER=null;
function finishStep(eye,budget){const st=DEFER;if(!st)return {done:true};const t0=Date.now(),baked=[];
  if(st.phase==='bake'){if(!st.order){const d=b=>{const cx=Math.max(b.min[0],Math.min(eye[0],b.max[0])),cz=Math.max(b.min[2],Math.min(eye[2],b.max[2]));return Math.hypot(cx-eye[0],cz-eye[2]);};
      st.order=[...BUCK.values()].filter(b=>b.mat!==3&&b.mat!==4&&b.n>0&&b.N).sort((a,b)=>d(a)-d(b));st.total=st.order.length;}
    if((st.k=(st.k||0)+1)%15===0&&st.i<st.order.length){const d=b=>{const cx=Math.max(b.min[0],Math.min(eye[0],b.max[0])),cz=Math.max(b.min[2],Math.min(eye[2],b.max[2]));return Math.hypot(cx-eye[0],cz-eye[2]);};st.order=st.order.slice(0,st.i).concat(st.order.slice(st.i).sort((a,b)=>d(a)-d(b)));}
    while(st.i<st.order.length&&Date.now()-t0<budget){const b=st.order[st.i++];bakeLight([b],false);baked.push(b);}
    if(st.i>=st.order.length)st.phase='rest';return {done:false,baked,progress:st.i/st.total};}
  bakeLight([],true);makeDecals();const before=new Set(BUCK.keys());plantTrees();plantSaplings();farCity();
  const fresh=[...BUCK.entries()].filter(([k])=>!before.has(k)).map(e=>e[1]);DEFER=null;return {done:true,baked,trees:TREE_B,fresh,progress:1};}

// ================= TREES =================
const TREE_B=new Map();
function tb(cx,cz){const ix=clamp(Math.floor((cx+2400)/CELL),0,23),iz=clamp(Math.floor((cz+2400)/CELL),0,23);const k=ix*24+iz;let b=TREE_B.get(k);if(!b){b={n:0,P:[],U:[],C:[],min:[1e9,1e9,1e9],max:[-1e9,-1e9,-1e9]};TREE_B.set(k,b);}return b;}
function addTree(x,y,z,type,s){
  const b=tb(x,z);const hgt=[15,12.5,6,11][type]*s,w=hgt*[0.5,0.9,0.8,0.95][type];
  const u0=type/4+0.003,u1=(type+1)/4-0.003;const t=0.8+R()*0.2;const tint=[t,Math.min(1,t*(0.94+R()*0.1)),t*0.97];
  const a=R()*PI;
  for(let q=0;q<3;q++){const an=a+q*PI/3,dx=Math.cos(an)*w/2,dz=Math.sin(an)*w/2;
    const v=[[x-dx,y-0.3,z-dz,u0,1],[x+dx,y-0.3,z+dz,u1,1],[x+dx,y+hgt,z+dz,u1,0],[x-dx,y+hgt,z-dz,u0,0]];
    for(const p of v){b.P.push(p[0],p[1],p[2]);b.U.push(p[3],p[4]);b.C.push(tint[0]*255,tint[1]*255,tint[2]*255,255);
      for(let i=0;i<3;i++){if(p[i]<b.min[i])b.min[i]=p[i];if(p[i]>b.max[i])b.max[i]=p[i];}}
    b.n+=4;}
}
// trees never grow out of paving (roads, pavements, paths, aprons, steps)
let TREE_PAVE=null;
function onPaving(x,z,y){if(!TREE_PAVE){TREE_PAVE=new Map();for(const f of FLIGHTS){const [ax,az,ya,bx,bz,yb,w]=f;const L=Math.hypot(bx-ax,bz-az)||1e-6;const q={ax,az,ux:(bx-ax)/L,uz:(bz-az)/L,L,hw:w/2+0.6,y:(ya+yb)/2};
    for(let i=Math.floor((Math.min(ax,bx)-w)/10);i<=Math.floor((Math.max(ax,bx)+w)/10);i++)for(let k=Math.floor((Math.min(az,bz)-w)/10);k<=Math.floor((Math.max(az,bz)+w)/10);k++){const key=i*10007+k;let a=TREE_PAVE.get(key);if(!a){a=[];TREE_PAVE.set(key,a);}a.push(q);}}}
  const a=TREE_PAVE.get(Math.floor(x/10)*10007+Math.floor(z/10));if(!a)return false;for(const q of a){const dx=x-q.ax,dz=z-q.az,t=dx*q.ux+dz*q.uz,v=-dx*q.uz+dz*q.ux;if(t>=-0.6&&t<=q.L+0.6&&Math.abs(v)<=q.hw&&Math.abs(q.y-y)<3)return true;}return false;}
let WEEDS=0;
function plantSaplings(){const hs=(a,b,c)=>((Math.sin(a*12.9898+b*78.233+c*37.719)*43758.5453)%1+1)%1;const B=new Set(['res','tower','hall','civic','hero']);
  const blocked=(x,z)=>FOOT.some(f=>(B.has(f.tag)||f.tag==='road'||f.tag==='hwy'||f.tag==='rail')&&x>f.x0&&x<f.x1&&z>f.z0&&z<f.z1);
  const put=(x,z,k)=>{if(Math.abs(x)>590||Math.abs(z)>590||inRiver(x,z,1))return;const y=meshH(x,z);if(onPaving(x,z,y)||blocked(x,z))return;addTree(x,y,z,2,0.07+hs(x,z,k)*0.11);WEEDS++;};
  for(const RD of ROADS){const P=RD.prof;if(!P)continue;for(let t=20;t<P.L-20;t+=63){if(hs(t,P.ax,P.az)>0.35)continue;const fi=Math.round(t/P.step);if(P.tun&&P.tun[fi])continue;const sd=hs(P.ax,t,1)<0.5?-1:1,off=RD.w/2-0.7,x=P.ax+P.ux*t-P.uz*sd*off,z=P.az+P.uz*t+P.ux*sd*off;if(Math.abs(x)>590||Math.abs(z)>590)continue;addTree(x,profY(P,x,z)+0.02,z,hs(t,2,3)<0.5?3:0,0.09+hs(t,4,5)*0.1);WEEDS++;}}
}
function plantTrees(){
  const G=4,N=550,occ=new Uint8Array(N*N);
  const mark=(x0,x1,z0,z1)=>{for(let i=Math.max(0,Math.floor((x0+1100)/G));i<=Math.min(N-1,Math.floor((x1+1100)/G));i++)for(let k=Math.max(0,Math.floor((z0+1100)/G));k<=Math.min(N-1,Math.floor((z1+1100)/G));k++)occ[i*N+k]=1;};
  for(const f of FOOT)mark(f.x0-1,f.x1+1,f.z0-1,f.z1+1);
  const isOcc=(x,z)=>{const i=Math.floor((x+1100)/G),k=Math.floor((z+1100)/G);return i<0||k<0||i>=N||k>=N?false:occ[i*N+k]===1;};
  for(const t of TREES)addTree(t.x,t.y,t.z,t.type,t.s);
  const sp=7.5;
  for(let x=-1000;x<1000;x+=sp)for(let z=-1000;z<1000;z+=sp){
    const px=x+rnd(0,sp),pz=z+rnd(0,sp);
    if(isOcc(px,pz))continue;
    if(pz<-452&&px>-440&&px<-160)continue;
    let dens=0.82;let city=false;
    for(const d of DISTRICTS)if(px>d.x0&&px<d.x1&&pz>d.z0&&pz<d.z1){city=true;break;}
    const rx=riverX(pz),rh=riverHalf(pz),dr=Math.abs(px-rx);
    if(pz>RIV0&&dr<rh.bed)dens=0.05;else if(pz>RIV0&&dr<rh.top+25)dens=0.35;else if(city)dens=0.07;
    if(px>-200&&px<-190||px>190&&px<210)dens=Math.min(dens,0.1);
    if(Math.hypot(px-675,pz+360)<30)dens=0;
    if(!chance(dens))continue;
    let type=city?(chance(0.6)?1:2):(chance(0.6)?0:chance(0.7)?1:2);const hh=((Math.sin(px*12.9898+pz*78.233)*43758.5453)%1+1)%1;if((city&&hh<0.55)||(!city&&hh<0.07&&type!==2))type=3;if(type===1)type=city?1:0;
    {const ty=meshH(px,pz),ts=rnd(0.75,1.35);if(!onPaving(px,pz,ty))addTree(px,ty,pz,type,ts);}
  }
  for(let x=-1500;x<1500;x+=12)for(let z=-1500;z<1500;z+=12){if(Math.abs(x)<1000&&Math.abs(z)<1000)continue;if(!chance(0.7))continue;const px=x+rnd(0,12),pz=z+rnd(0,12);addTree(px,30,pz,chance(0.7)?0:1,rnd(0.9,1.5));}
}
function farCity(){
  for(let i=0;i<520;i++){const a=rnd(0,PI*2),r=rnd(1450,2900),x=Math.cos(a)*r,z=Math.sin(a)*r;push(x,29.5,z,rnd(0,PI),{mat:4,base:29.5});
    const tall=chance(0.12);box(0,0,0,rnd(20,80),tall?rnd(60,110):rnd(15,45),rnd(12,24),pick([COL.con,COL.conD,COL.panel]),{nc:true});pop();}
}

// ================= TERRAIN MESH =================
const TN=401,TS=5,TO=-1000;let TLEV=null,THS=null;const FINE_MARK=[];
function terrColor(x,z,n){
  const slope=1-n[1];
  const nz=0.5+0.5*Math.sin(x*0.09+Math.sin(z*0.07)*2)*Math.sin(z*0.11+x*0.03);
  let c=[lerp(0.27,0.36,nz),lerp(0.34,0.41,nz),lerp(0.21,0.26,nz)];
  let city=false;for(const d of DISTRICTS)if(x>d.x0&&x<d.x1&&z>d.z0&&z<d.z1){city=true;break;}
  if(city)c=[lerp(0.36,0.44,nz),lerp(0.37,0.43,nz),lerp(0.30,0.34,nz)];
  const rx=riverX(z),rh=riverHalf(z),dr=Math.abs(x-rx);
  if(z>RIV0&&dr<rh.top+2){if(dr<rh.bed+1)c=[lerp(0.30,0.38,nz),lerp(0.28,0.34,nz),lerp(0.23,0.27,nz)];else c=z>-390?[0.53,0.53,0.5]:[0.44,0.43,0.40];}
  if(slope>0.35&&!(z>RIV0&&dr<rh.top+2))c=[0.42,0.42,0.39];
  if(z<-452&&x>-440&&x<-160)c=[0.28,0.27,0.23];
  if(Math.abs(x)>900||Math.abs(z)>900)c=[c[0]*0.85,c[1]*0.9,c[2]*0.85];
  let m=city?MAT.dirt:MAT.grass;if(!city&&nz<0.35)m=MAT.forest;
  if(z>RIV0&&dr<rh.top+2)m=dr<rh.bed+1?MAT.dirt:(z>-390?MAT.bank:MAT.rock);
  if(slope>0.35&&!(z>RIV0&&dr<rh.top+2))m=MAT.rock;
  if(z<-452&&x>-440&&x<-160)m=MAT.dirt;
  c[3]=m;return c;
}
function markLevels(){
  const lev=new Uint8Array(TN*TN);
  const mark=(x0,x1,z0,z1,L)=>{for(let i=Math.max(0,Math.floor((x0-TO)/TS)-1);i<=Math.min(TN-2,Math.floor((x1-TO)/TS)+1);i++)for(let k=Math.max(0,Math.floor((z0-TO)/TS)-1);k<=Math.min(TN-2,Math.floor((z1-TO)/TS)+1);k++)if(lev[i*TN+k]<L)lev[i*TN+k]=L;};
  for(const p of BPADS){const e=p.m+5;for(let i=Math.max(0,Math.floor((p.x0-e-TO)/TS));i<=Math.min(TN-2,Math.floor((p.x1+e-TO)/TS));i++)for(let k=Math.max(0,Math.floor((p.z0-e-TO)/TS));k<=Math.min(TN-2,Math.floor((p.z1+e-TO)/TS));k++){
    const cx0=TO+i*TS,cz0=TO+k*TS;if(!p.ob&&cx0>=p.x0&&cx0+TS<=p.x1&&cz0>=p.z0&&cz0+TS<=p.z1)continue;if(p.ob){const o=p.ob;let inside=true;for(const [qx,qz] of [[cx0,cz0],[cx0+TS,cz0],[cx0,cz0+TS],[cx0+TS,cz0+TS]]){const u=Math.abs((qx-o.cx)*o.c+(qz-o.cz)*o.s),v=Math.abs(-(qx-o.cx)*o.s+(qz-o.cz)*o.c);if(u>o.hx-0.5||v>o.hz-0.5)inside=false;}if(inside)continue;}if(lev[i*TN+k]<2)lev[i*TN+k]=2;}}
  for(const c of CUTS)if(!c.noPatch)mark(c.x0,c.x1,c.z0,c.z1,5);
  for(const r of FINE_MARK)mark(r.x0,r.x1,r.z0,r.z1,r.lv||3);
  for(const p of PADS)if(p.y===0&&p.x1-p.x0<240)mark(p.x0,p.x1,p.z0,p.z1,1);
  for(const h of HOLES){const r=h.hl+h.hw;mark(h.cx-r,h.cx+r,h.cz-r,h.cz+r,5);}
  for(const g of GUARD_MARK){const m=g.w/2+2;for(let s=0;s<=g.L;s+=4){const x=g.ax+g.ux*s,z=g.az+g.uz*s,y=lerp(g.ya,g.yb,s/g.L);if(baseH(x,z)<y+g.hh+1.5)mark(x-m,x+m,z-m,z+m,5);}}
  return lev;
}
// height of sub-vertex (a,b) of cell (i,k) at level n — shared by the mesh and the query, so they agree exactly
function cellLev(i,k){if(i<0||k<0||i>TN-2||k>TN-2)return 1;return Math.max(1,TLEV[i*TN+k]);}
const VHC=new Map();
function vh(i,k,n,a,b){
  if((a===0||a===n)&&(b===0||b===n))return THS[(i+a/n)*TN+(k+b/n)];
  const rr=(a===0||a===n)?Math.min(n,cellLev(a===0?i-1:i+1,k)):(b===0||b===n)?Math.min(n,cellLev(i,b===0?k-1:k+1)):9;
  const key=(((i*TN+k)*6+n)*36+a*6+b)*10+rr;let v=VHC.get(key);if(v===undefined){v=vh0(i,k,n,a,b);VHC.set(key,v);}return v;
}
function vh0(i,k,n,a,b){
  const x0=TO+i*TS,z0=TO+k*TS;
  let r=n,t=null,fixedX=null,fixedZ=null;
  if(a===0||a===n){const ni=a===0?i-1:i+1;r=Math.min(n,cellLev(ni,k));t=b/n;fixedX=x0+(a/n)*TS;}
  else if(b===0||b===n){const nk=b===0?k-1:k+1;r=Math.min(n,cellLev(i,nk));t=a/n;fixedZ=z0+(b/n)*TS;}
  else return H(x0+a/n*TS,z0+b/n*TS);
  const j=Math.min(r-1,Math.floor(t*r+1e-9)),f=t*r-j;
  const P=s=>fixedX!=null?H(fixedX,z0+s*TS):H(x0+s*TS,fixedZ);
  const h0=(j===0)?(fixedX!=null?THS[(i+a/n)*TN+k]:THS[i*TN+(k+b/n)]):P(j/r),h1=(j+1===r)?(fixedX!=null?THS[(i+a/n)*TN+k+1]:THS[(i+1)*TN+(k+b/n)]):P((j+1)/r);
  return lerp(h0,h1,f);
}
function meshH(x,z){
  const fi=(x-TO)/TS,fk=(z-TO)/TS,i=clamp(Math.floor(fi),0,TN-2),k=clamp(Math.floor(fk),0,TN-2),n=cellLev(i,k);
  const u=(fi-i)*n,v=(fk-k)*n,a=Math.min(n-1,Math.floor(u)),b=Math.min(n-1,Math.floor(v)),du=u-a,dv=v-b;
  const h00=vh(i,k,n,a,b),h11=vh(i,k,n,a+1,b+1);
  if(dv>=du){const h01=vh(i,k,n,a,b+1);return h00+(h11-h01)*du+(h01-h00)*dv;}
  const h10=vh(i,k,n,a+1,b);return h00+(h10-h00)*du+(h11-h10)*dv;
}
function buildTerrain(){
  const N=TN,S=TS,O=TO;
  THS=new Float32Array(N*N);
  for(let i=0;i<N;i++)for(let k=0;k<N;k++)THS[i*N+k]=H(O+i*S,O+k*S);
  TLEV=markLevels();
  // upgrade refinement wherever the medium mesh would still poke through a step or ramp
  const mk=(x0,x1,z0,z1)=>{for(let i=Math.max(0,Math.floor((x0-TO)/TS)-1);i<=Math.min(TN-2,Math.floor((x1-TO)/TS)+1);i++)for(let k=Math.max(0,Math.floor((z0-TO)/TS)-1);k<=Math.min(TN-2,Math.floor((z1-TO)/TS)+1);k++)TLEV[i*TN+k]=5;};
  for(let pass=0;pass<2;pass++)for(const r of FINE_MARK){const [ax,az,ya,bx,bz,yb,w]=r.f;const L=Math.hypot(bx-ax,bz-az)||1,ux=(bx-ax)/L,uz=(bz-az)/L;let bad=false;
    for(let s=0;s<=L&&!bad;s+=0.5)for(const off of [0,-(w/2-0.1),(w/2-0.1)]){const x=ax+ux*s-uz*off,z=az+uz*s+ux*off,y=ya+(yb-ya)*s/L;if(inHole(x,z))continue;const m=meshH(x,z);if(m>y+0.05&&m<y+2.5){bad=true;break;}}
    if(bad)mk(r.x0,r.x1,r.z0,r.z1);}
  const P=[],Nn=[],C=[],I=[];
  // coarse grid vertices
  const cid=new Int32Array(N*N);
  for(let i=0;i<N;i++)for(let k=0;k<N;k++){const x=O+i*S,z=O+k*S,id=i*N+k;const hl=THS[Math.max(0,i-1)*N+k],hr=THS[Math.min(N-1,i+1)*N+k],hd=THS[i*N+Math.max(0,k-1)],hu=THS[i*N+Math.min(N-1,k+1)];
    const n=norm([hl-hr,2*S,hd-hu]);const c=terrColor(x,z,n);P.push(x,THS[id],z);Nn.push(n[0]*127,n[1]*127,n[2]*127,127);C.push(c[0]*255,c[1]*255,c[2]*255,c[3]);cid[id]=P.length/3-1;}
  let fine=0;
  for(let i=0;i<N-1;i++)for(let k=0;k<N-1;k++){
    const n=cellLev(i,k);
    if(n===1){const a=cid[i*N+k],b=cid[(i+1)*N+k],c=cid[(i+1)*N+k+1],d=cid[i*N+k+1];I.push(a,d,c,a,c,b);continue;}
    fine++;const M=n+1,hh=new Float32Array(M*M),ids=new Int32Array(M*M),st=S/n;
    for(let a=0;a<=n;a++)for(let b=0;b<=n;b++)hh[a*M+b]=vh(i,k,n,a,b);
    for(let a=0;a<=n;a++)for(let b=0;b<=n;b++){const x=O+i*S+a*st,z=O+k*S+b*st;
      const hl=hh[Math.max(0,a-1)*M+b],hr=hh[Math.min(n,a+1)*M+b],hd=hh[a*M+Math.max(0,b-1)],hu=hh[a*M+Math.min(n,b+1)];
      const sx=(Math.min(n,a+1)-Math.max(0,a-1))*st,sz=(Math.min(n,b+1)-Math.max(0,b-1))*st;
      const nn=norm([(hl-hr)/sx*2,2,(hd-hu)/sz*2]);const c=terrColor(x,z,nn);P.push(x,hh[a*M+b],z);Nn.push(nn[0]*127,nn[1]*127,nn[2]*127,127);C.push(c[0]*255,c[1]*255,c[2]*255,c[3]);ids[a*M+b]=P.length/3-1;}
    const nearHole=HOLES.length&&HOLES.some(h=>{const r=h.hl+h.hw+S;return Math.abs(O+i*S+S/2-h.cx)<r&&Math.abs(O+k*S+S/2-h.cz)<r;});
    for(let a=0;a<n;a++)for(let b=0;b<n;b++){const p=ids[a*(n+1)+b],q=ids[(a+1)*(n+1)+b],r=ids[(a+1)*(n+1)+b+1],s=ids[a*(n+1)+b+1];
      if(nearHole){const cx=O+i*S+(a+0.5)*st,cz=O+k*S+(b+0.5)*st;if(inHole(cx-st/6,cz+st/6)||inHole(cx+st/6,cz-st/6)){if(!inHole(cx-st/6,cz+st/6))I.push(p,r,q);else if(!inHole(cx+st/6,cz-st/6))I.push(p,s,r);continue;}}
      I.push(p,s,r,p,r,q);}
  }
  // outer ring
  const base=P.length/3;const ring=[[-6000,-6000],[6000,-6000],[6000,6000],[-6000,6000],[-1000,-1000],[1000,-1000],[1000,1000],[-1000,1000]];
  for(const [x,z] of ring){P.push(x,29.8,z);Nn.push(0,127,0,127);C.push(0.22*255,0.28*255,0.19*255,MAT.forest);}
  const q=(o0,o1,i0,i1)=>I.push(base+o0,base+i0,base+i1,base+o0,base+i1,base+o1);
  q(0,1,4,5);q(1,2,5,6);q(2,3,6,7);q(3,0,7,4);
  STATS.fineCells=fine;
  return {P:new Float32Array(P),N:new Int8Array(Nn),C:new Uint8Array(C),I:new Uint32Array(I)};
}

// ================= BAKED LIGHT (PS1-style per-vertex) =================
function coarseH(x,z){const fi=clamp((x-TO)/TS,0,TN-1.001),fk=clamp((z-TO)/TS,0,TN-1.001),i=Math.floor(fi),k=Math.floor(fk),u=fi-i,v=fk-k;
  return lerp(lerp(THS[i*TN+k],THS[(i+1)*TN+k],u),lerp(THS[i*TN+k+1],THS[(i+1)*TN+k+1],u),v);}
// daylight indoors comes only through openings: each window / outside door lights the room in front of it, falling off with distance
let WLG=null;
function buildWindowLight(covered){WLG=new Map();const add=(k,isDoor)=>{const c=Math.cos(k[3]),s=Math.sin(k[3]),W=isDoor?(k[10]||k[4]):k[4],cx=k[0]+c*W/2,cz=k[2]+s*W/2,cy=k[1]+k[5]/2,nx=-s,nz=c;
    const outA=!covered(cx+nx*0.9,cy,cz+nz*0.9),outB=!covered(cx-nx*0.9,cy,cz-nz*0.9);if(outA===outB)return;const sg=outA?-1:1;
    const ix=nx*sg,iz=nz*sg,py=k[1]+0.4,e={x:cx,y:cy,z:cz,ix,iz,y0:k[1]-1.4,y1:k[1]+k[5]+0.7,a:Math.min(1.3,W*k[5]/2.4)};
    const D=rayHit(cx+ix*0.3,py,cz+iz*0.3,ix,iz,8)+0.3;e.D=D;const mx=cx+ix*Math.min(1.0,D*0.5),mz=cz+iz*Math.min(1.0,D*0.5);
    e.Lp=rayHit(mx,py,mz,-iz,ix,8);e.Lm=rayHit(mx,py,mz,iz,-ix,8);
    const b0=Math.floor((e.y0+200)/3),b1=Math.floor((e.y1+200)/3);for(let i=Math.floor((cx-9)/6);i<=Math.floor((cx+9)/6);i++)for(let j=Math.floor((cz-9)/6);j<=Math.floor((cz+9)/6);j++)for(let b=b0;b<=b1;b++){const key=(i*10007+j)*256+b;let a=WLG.get(key);if(!a){a=[];WLG.set(key,a);}a.push(e);}};
  for(const k of KW)add(k,false);for(const k of KD)if(!(k[7]&1))add(k,true);
  for(const L of BLAST_LIGHTS){const e={x:L.x,y:L.y,z:L.z,ix:L.ix,iz:L.iz,y0:L.y0,y1:L.y1,a:2.2,D:9,Lp:L.w/2+2,Lm:L.w/2+2};const b0=Math.floor((e.y0+200)/3),b1=Math.floor((e.y1+200)/3);
    for(let i=Math.floor((L.x-12)/6);i<=Math.floor((L.x+12)/6);i++)for(let j=Math.floor((L.z-12)/6);j<=Math.floor((L.z+12)/6);j++)for(let b=b0;b<=b1;b++){const key=(i*10007+j)*256+b;let a=WLG.get(key);if(!a){a=[];WLG.set(key,a);}a.push(e);}}}
const WDC=new Map();
function windowDay(x,y,z){const ck=Math.round(x*4)*73856093^Math.round(y*4)*19349663^Math.round(z*4)*83492791;const cv=WDC.get(ck);if(cv!==undefined)return cv;
  const a=WLG&&WLG.get((Math.floor(x/6)*10007+Math.floor(z/6))*256+Math.floor((y+200)/3));let s=0;
  if(a)for(let n=0;n<a.length;n++){const e=a[n];if(y<e.y0||y>e.y1)continue;const dx=x-e.x,dz=z-e.z;if(dx*dx+dz*dz>81)continue;const into=dx*e.ix+dz*e.iz;if(into<-0.3||into>e.D+0.15)continue;
    const lat=-dx*e.iz+dz*e.ix;if(lat<-e.Lm-0.15||lat>e.Lp+0.15)continue;const dy=(y-e.y)*0.6,d=Math.sqrt(dx*dx+dz*dz+dy*dy);if(d>9)continue;
    const fr=into/(d>0.01?d:0.01);s+=0.6*Math.exp(-d/1.7)*e.a*(0.45+0.55*(fr<0?0:fr>1?1:fr));}
  s=s<0.66?s:0.66;if(WDC.size<4e6)WDC.set(ck,s);return s;}
// exact distance along a horizontal ray to the first solid at height y (segment vs oriented box), up to maxD
let RAYGEN=0;
function rayHit(x,y,z,dx,dz,maxD){const gen=++RAYGEN;let best=maxD;
  for(let t=0;t<=maxD+8;t+=8){const L=cellList(x+dx*Math.min(t,maxD),z+dz*Math.min(t,maxD));for(let n=0;n<L.length;n++){const o=L[n];if(o._rg===gen)continue;o._rg=gen;if(o.ramp||y<o.y0||y>o.y1)continue;
      const ox=x-o.cx,oz=z-o.cz,u0=ox*o.c+oz*o.s,v0=-ox*o.s+oz*o.c,du=dx*o.c+dz*o.s,dv=-dx*o.s+dz*o.c;let t0=0,t1=best;
      if(du>1e-9||du<-1e-9){let a=(-o.hx-u0)/du,b=(o.hx-u0)/du;if(a>b){const q=a;a=b;b=q;}if(a>t0)t0=a;if(b<t1)t1=b;}else if(u0>o.hx||u0<-o.hx)continue;
      if(dv>1e-9||dv<-1e-9){let a=(-o.hz-v0)/dv,b=(o.hz-v0)/dv;if(a>b){const q=a;a=b;b=q;}if(a>t0)t0=a;if(b<t1)t1=b;}else if(v0>o.hz||v0<-o.hz)continue;
      if(t0<=t1&&t0<best)best=t0>0?t0:0;}}
  return best;}
let INDOOR_AT=null;
function bakeLight(list,doKits){
  const LG=new Map(),LC=16;for(const p of LAMPS){const key=Math.floor(p[0]/LC)*10007+Math.floor(p[2]/LC);let L=LG.get(key);if(!L){L=[];LG.set(key,L);}L.push(p);}
  const lampAt=(x,y,z)=>{let s=0;const ci=Math.floor(x/LC),ck=Math.floor(z/LC);for(let i=ci-1;i<=ci+1;i++)for(let k=ck-1;k<=ck+1;k++){const L=LG.get(i*10007+k);if(!L)continue;for(const p of L){const dx=p[0]-x,dy=(p[1]-y)*1.3,dz=p[2]-z,d2=dx*dx+dy*dy+dz*dz;if(d2<196){const t=1-Math.sqrt(d2)/14;s+=t*t*0.75;}}}return Math.min(0.75,s);};
  let colMax=new Map();
  const topCover=(x,z)=>{const kx=Math.round(x*4),kz=Math.round(z*4),key=kx*1e6+kz;let v=colMax.get(key);if(v!==undefined)return v;const px=kx/4,pz=kz/4;v=-1e9;const L=cellList(px,pz);
    for(let i=0;i<L.length;i++){const o=L[i];if(o.ramp||o.hx*o.hz<=0.6)continue;const dx=px-o.cx,dz=pz-o.cz,u=dx*o.c+dz*o.s,w=-dx*o.s+dz*o.c;if(u>-o.hx&&u<o.hx&&w>-o.hz&&w<o.hz&&o.y0>v)v=o.y0;}colMax.set(key,v);return v;};
  const covered=(x,y,z)=>topCover(x,z)>y+0.15;if(!WLG)buildWindowLight(covered);
  for(const b of (list||BUCK.values())){if(b.mat===3||b.mat===4)continue;const P=b.P,N=b.N,C=b.C;colMax=new Map();
    for(let i=0;i<b.n;i++){if(C[i*4+3]===255){N[i*4+3]=127;continue;}
      const x=P[i*3]+N[i*4]/127*0.35,y=P[i*3+1]+N[i*4+1]/127*0.35,z=P[i*3+2]+N[i*4+2]/127*0.35;
      const under=y<coarseH(x,z)-1.5;
      if(!under&&!covered(x,y,z)){N[i*4+3]=127;continue;}
      const lv=(under?0.12:0.04+windowDay(x,y,z))+lampAt(x,y,z);N[i*4+3]=Math.round(Math.min(0.9,lv)*127);}}
  if(doKits===false)return;colMax=new Map();
  const lt=(x,y,z)=>{const under=y<coarseH(x,z)-1.5;if(!under&&!covered(x,y,z))return 1;return Math.min(0.9,(under?0.12:0.04+windowDay(x,y,z))+lampAt(x,y,z));};
  INDOOR_AT=lt;
  for(const K of [KW,KD])for(const k of K){const c=Math.cos(k[3]),s=Math.sin(k[3]),nx=-s,nz=c,ox=k===undefined?0:(K===KD?Math.cos(k[3])*k[4]*0.5:0),oz=K===KD?Math.sin(k[3])*k[4]*0.5:0;
    const px=k[0]+ox,py=k[1]+Math.min(1.2,k[5]*0.5),pz=k[2]+oz;
    k[8]=lt(px+nx*(k[6]/2+0.4),py,pz+nz*(k[6]/2+0.4));k[9]=lt(px-nx*(k[6]/2+0.4),py,pz-nz*(k[6]/2+0.4));
    if(K===KW)k[10]=k[8]>=k[9]?1:-1;}
}
// ================= COLLISION QUERIES =================
const EMPTY=[];
function cellList(x,z){return HASH.get(hk(Math.floor(x/HS),Math.floor(z/HS)))||EMPTY;}
function groundAt(x,z,yMax){
  let best=THS?(HOLES.length&&inHole(x,z)?-1e9:meshH(x,z)):H(x,z);if(best>yMax)best=-1e9;
  const L=cellList(x,z);
  for(let i=0;i<L.length;i++){const o=L[i];const dx=x-o.cx,dz=z-o.cz;const u=dx*o.c+dz*o.s,v=-dx*o.s+dz*o.c;
    if(u<-o.hx||u>o.hx||v<-o.hz||v>o.hz)continue;
    const top=o.ramp?o.y0+(o.y1-o.y0)*(u/o.hx+1)/2:o.y1;
    if(top<=yMax&&top>best)best=top;}
  return best;
}
function pushOut(p,r,feet){
  for(let it=0;it<2;it++){
    for(const cx of [p[0]-r,p[0]+r])for(const cz of [p[2]-r,p[2]+r]){
      const L=cellList(cx,cz);
      for(let i=0;i<L.length;i++){const o=L[i];if(o.ramp)continue;if(o.y1<=feet+0.5||o.y0>=feet+1.75)continue;
        const dx=p[0]-o.cx,dz=p[2]-o.cz;let u=dx*o.c+dz*o.s,v=-dx*o.s+dz*o.c;
        const cu=clamp(u,-o.hx,o.hx),cv=clamp(v,-o.hz,o.hz);const du=u-cu,dv=v-cv,d2=du*du+dv*dv;
        if(d2>=r*r)continue;
        if(d2>1e-8){const d=Math.sqrt(d2),k=(r-d)/d;u+=du*k;v+=dv*k;}
        else{const px=o.hx-Math.abs(u),pz=o.hz-Math.abs(v);if(px<pz)u=(u<0?-1:1)*(o.hx+r);else v=(v<0?-1:1)*(o.hz+r);}
        p[0]=o.cx+u*o.c-v*o.s;p[2]=o.cz+u*o.s+v*o.c;
      }
    }
  }
}
// ================= ARCHITECTURE PASS 2: shapes from the reference sheets =================
const FRAMES=[],XTRA=[];
// rooftop equipment (call inside a building frame at roof level yr)
function roofKit(x0,x1,z0,z1,yr){
  const r=R();
  if(r<0.18){const cx=rnd(x0+4,x1-4),cz=rnd(z0+3,z1-3);push(cx,yr,cz,rnd(0,PI*2));box(0,0,0,2.4,0.4,2.4,COL.conD);for(const [a,b] of [[-0.8,-0.8],[0.8,-0.8],[0.8,0.8],[-0.8,0.8]])beamL([a,0.4,b],[a*0.3,3,b*0.3],0.12,0.12,COL.steel,{nc:true});
    const T=F.tilt;F.tilt=tiltX(F.oy+3.4,F.oz,0.7);cyl(0,3,0,0.3,3.2,1.2,12,COL.steel,{open:true});for(let i=0;i<6;i++){const a=i/6*PI*2;beamL([0,3,0],[Math.cos(a)*3.2,4.2,Math.sin(a)*3.2],0.05,0.05,COL.steel,{nc:true});}beamL([0,3.6,0],[0,6,0],0.06,0.06,COL.steel,{nc:true});F.tilt=T;pop();}
  else if(r<0.4){const cx=rnd(x0+3,x1-3),cz=rnd(z0+3,z1-3);push(cx,yr,cz,0);for(const [a,b] of [[-1.4,-1.4],[1.4,-1.4],[1.4,1.4],[-1.4,1.4]])box(a,0,b,0.25,2.6,0.25,COL.steel,{nc:true});box(0,2.6,0,3.4,0.2,3.4,COL.steel);cyl(0,2.8,0,1.6,1.6,2.6,12,COL.conL);cyl(0,5.4,0,1.7,0.3,0.6,12,COL.conD);pop();}
  else if(r<0.55){const cx=rnd(x0+3,x1-3),cz=rnd(z0+3,z1-3);push(cx,yr,cz,0);box(0,0,0,0.5,9,0.5,COL.steel,{nc:true});for(let k=1;k<5;k++)beamL([-1.2,k*1.9,0],[1.2,k*1.9,0],0.06,0.06,COL.steel,{nc:true});for(const s of [-1,1])beamL([0,8.5,0],[s*4,0.1,s*2],0.03,0.03,COL.steel,{nc:true});pop();}
}
// atrium block: hollow core with gallery rings and bridges
function atriumBlock(p){
  const S=p.size||34,h=S/2,n=p.floors,FH=3,V=p.v||7;
  const gb=groundBase(p.x,p.z,S,S,p.ry);
  reserve(footAABB(p.x,p.z,S+2,S+2,p.ry),'tower');addBPad(footAABB(p.x,p.z,S+3,S+3,p.ry),gb.top-0.05,9);
  push(p.x,gb.top,p.z,p.ry,{base:gb.top});
  box(0,gb.bot-gb.top-2,0,S,gb.top-gb.bot+2-0.4,S,COL.conD);
  const xs=-h+2.6,zl=h-1.2,nb=Math.round(S/3);
  for(let f=0;f<n;f++){
    const y=f*FH,holes=[];if(f>=1){holes.push({x0:-V,x1:V,z0:-V,z1:V},stairHole(xs,zl,-1>0?1:1));}
    slabR(-h,h,-h,h,y,f===0?0.4:0.25,holes,COL.conL);
    for(const side of [0,1,2,3]){push(0,0,0,side*HP);const ops=[];for(let b=0;b<nb;b++){const bx=-h+1.5+3*b;
      if(f===0&&side===0&&Math.abs(bx)<2)ops.push({x:bx,w:2.6,sill:0,top:2.8});else ops.push({x:bx,w:1.6,sill:0.9,top:2.35});}
      wallRun(-h+0.3,h-0.3,h-0.15,0.3,y,FH,ops,COL.panel);pop();}
    if(f>=1)for(const s of [-1,1]){box(0,y,s*(V+0.1),2*V+0.4,1.05,0.18,COL.conL);box(s*(V+0.1),y,0,0.18,1.05,2*V,COL.conL);}
    for(const s of [-1,1])for(const t of [-1,1])box(s*(V+0.9),y,t*(V+0.9),0.7,FH,0.7,COL.con);
    // inner ring of flats: walls 4 m behind the gallery with doors
    const ri=V+3.4;for(const side of [0,1,2,3]){push(0,0,0,side*HP);wallRun(-ri,ri,ri,0.15,y,FH,[{x:-ri/2,w:1,sill:0,top:2.2},{x:ri/2,w:1,sill:0,top:2.2}],COL.white);
      for(const xx of [-ri,ri])box(xx,y,(ri+h)/2,0.15,FH,h-ri-0.3,COL.white);pop();}
    stairs(xs,zl,1,y,FH,2,COL.conL);
    if(f>=2&&f%3===2){const zz=rnd(-V+2,V-2);box(0,y-0.25,zz,2*V+0.4,0.25,1.6,COL.conL);for(const s of [-1,1])box(0,y,zz+s*0.75,2*V+0.4,1.0,0.1,COL.rust);}
  }
  const yr=n*FH;slabR(-h,h,-h,h,yr,0.3,[{x0:-V,x1:V,z0:-V,z1:V},stairHole(xs,zl,1)],COL.conD);
  for(let x=-V;x<=V;x+=3.5)box(x,yr-0.4,0,0.3,0.4,2*V,COL.rust,{nc:true});
  box(0,yr,h-0.12,S,1,0.25,COL.con);box(0,yr,-h+0.12,S,1,0.25,COL.con);box(h-0.12,yr,0,0.25,1,S,COL.con);box(-h+0.12,yr,0,0.25,1,S,COL.con);
  wallRunZ(zl-6,zl,xs-1.575,0.15,yr,3,[],COL.con);wallRunZ(zl-6,zl,xs+1.575,0.15,yr,3,[{x:zl-0.6,w:0.9,sill:0,top:2.1}],COL.con);wallRun(xs-1.65,xs+1.65,zl-6,0.15,yr,3,[],COL.con);box(xs,yr+3,zl-3,3.4,0.25,6.2,COL.conD);
  roofKit(-h+2,h-2,-h+2,-V-1,yr);
  entrance(0,h,0,1,3.4);
  pop();
}
// multi-storey parking garage: stacked decks, ramps along one side
function garage(p){
  const L=p.len||66,D=p.depth||36,n=p.levels||4,FH=3.2,RL=34,rz=D/2-4.5;
  const gb=groundBase(p.x,p.z,L,D,p.ry);
  reserve(footAABB(p.x,p.z,L+2,D+2,p.ry),'civic');addBPad(footAABB(p.x,p.z,L+3,D+3,p.ry),gb.top-0.05,9);
  push(p.x,gb.top,p.z,p.ry,{base:gb.top});
  box(0,gb.bot-gb.top-2,0,L,gb.top-gb.bot+2-0.4,D,COL.conD);
  const rx0=-L/2+6,rx1=rx0+RL;
  for(let f=0;f<=n;f++){
    const y=f*FH,holes=[];if(f>=1)holes.push({x0:rx0+RL*0.3,x1:rx1+0.5,z0:rz-3.2,z1:rz+3.2},stairHole(L/2-3,-D/2+1.4,-1));
    slabR(-L/2,L/2,-D/2,D/2,y,f===0?0.4:0.35,holes,f===n?COL.conD:COL.conL);
    if(f<n){for(let x=-L/2+1;x<=L/2-1;x+=8)for(let z=-D/2+1;z<=D/2-1;z+=8.5){if(x>rx0-1&&x<rx1+1&&Math.abs(z-rz)<4)continue;box(x,y,z,0.7,FH-0.35,0.7,COL.con);}
      flight(rx0,rz,y,rx1,rz,y+FH,6,COL.conD,false);box((rx0+rx1)/2,y,rz-3.15,RL,FH-0.4,0.15,COL.conL,{nc:true});
      stairs(L/2-3,-D/2+1.4,-1,y,FH,2,COL.conL);for(const sx of [-1,1])wallRunZ(-D/2+1.4,-D/2+7.4,L/2-3+sx*1.575,0.15,y,FH,[],COL.conL);}
    if(f>=1){const ops=[{x:-L/2+3,w:4,sill:0,top:0},{x:L/2-3,w:4,sill:0,top:0}];
      for(const s of [-1,1]){box(0,y,s*(D/2-0.15),L,1.1,0.3,COL.conL);box(s*(L/2-0.15),y,0,0.3,1.1,D,COL.conL);}
      for(let x=-L/2+4;x<L/2;x+=8)box(x,y+1.1,D/2-0.15,0.35,FH-1.45,0.3,COL.con,{nc:true});}
  }
  for(let i=0;i<Math.round(n*2);i++){rnd(-L/2+4,rx0-3);rnd(0,n);rnd(-D/2+4,D/2-10);pick([0,PI]);keepSeq3();}
  roofKit(-L/2+4,L/2-4,-D/2+4,0,n*FH);
  pop();
}
// tower crane over a construction site
function towerCrane(x,z,hgt,jib,ang){
  const g=H(x,z);push(x,g,z,ang,{base:g,mat:1});
  box(0,-0.5,0,5,1,5,COL.conD);
  const segs=Math.round(hgt/4);
  for(let k=0;k<segs;k++){const y0=k*4,y1=y0+4;for(const [a,b] of [[-0.9,-0.9],[0.9,-0.9],[0.9,0.9],[-0.9,0.9]])beamL([a,y0,b],[a,y1,b],0.15,0.15,COL.yellow,{nc:true});
    for(const s of [-1,1]){beamL([-0.9,y0,s*0.9],[0.9,y1,s*0.9],0.06,0.06,COL.yellow,{nc:true});beamL([s*0.9,y0,-0.9],[s*0.9,y1,0.9],0.06,0.06,COL.yellow,{nc:true});}}
  box(0,hgt,0,2.6,2.2,2.4,COL.yellow,{nc:true});box(1.6,hgt+0.4,0,1.4,1.6,1.6,COL.glass,{nc:true});
  for(const s of [-1,1]){beamL([0,hgt+2.2,s*0.6],[jib,hgt+2.2,s*0.6],0.1,0.1,COL.yellow,{nc:true});beamL([0,hgt+2.2,s*0.6],[-jib*0.3,hgt+2.2,s*0.6],0.1,0.1,COL.yellow,{nc:true});}
  for(let d=0;d<jib;d+=3)beamL([d,hgt+2.2,0],[d+3,hgt+3.6,0],0.06,0.06,COL.yellow,{nc:true});
  beamL([0,hgt+7,0],[jib*0.7,hgt+3.6,0],0.04,0.04,COL.steel,{nc:true});beamL([0,hgt+7,0],[-jib*0.3,hgt+2.4,0],0.04,0.04,COL.steel,{nc:true});box(0,hgt+2.2,0,0.4,4.8,0.4,COL.yellow,{nc:true});
  box(-jib*0.27,hgt+0.4,0,2.4,1.8,1.6,COL.conD,{nc:true});
  const hx=jib*rnd(0.4,0.9);box(hx,hgt+1.9,0,1,0.3,1,COL.steel,{nc:true});beamL([hx,hgt+1.9,0],[hx,hgt*rnd(0.3,0.7),0],0.03,0.03,COL.steel,{nc:true});
  pop();
}
function gantryCrane(x,z,span,len){const g=H(x,z);push(x,g,z,0,{base:g});for(const s of [-1,1]){for(const e of [-1,1])beamL([s*span/2,0,e*2.5],[s*span/2,12,0],0.4,0.4,COL.yellow);box(s*span/2,12,0,1,1,6,COL.yellow,{nc:true});}
  box(0,12.5,-1.5,span+2,1.4,0.8,COL.yellow,{nc:true});box(0,12.5,1.5,span+2,1.4,0.8,COL.yellow,{nc:true});box(rnd(-span/3,span/3),11,0,3,1.6,3.6,COL.rust,{nc:true});pop();}
function chimneyAt(x,z,hgt,col){const a={x0:x-6,x1:x+6,z0:z-6,z1:z+6};if(overlaps(a,2))return;reserve(a,'hero');const g=H(x,z);push(x,g,z,0,{mat:1,base:g});box(0,-1,0,8,2.5,8,COL.conD);
  const n=Math.round(hgt/8);for(let i=0;i<n;i++)cyl(0,1.5+i*8,0,lerp(3.2,2.0,i/n),lerp(3.2,2.0,(i+1)/n),8,12,i===n-1?COL.dark:col,{open:true,coll:i===0});
  for(let k=1;k<4;k++)cyl(0,1.5+hgt*k/4,0,lerp(3.2,2.0,k/4)+0.25,lerp(3.2,2.0,k/4)+0.25,0.5,12,COL.conD,{open:true});pop();}
// cliff lookout tower on the gorge rim
function cliffLookout(){
  const x=-160,z=-418,g=H(x,z);reserve({x0:x-8,x1:x+8,z0:z-8,z1:z+8},'hero');addBPad({x0:x-7,x1:x+7,z0:z-7,z1:z+7},g-0.05,8);
  push(x,g,z,0,{base:g});
  for(let f=0;f<5;f++){const y=f*3;slabR(-6,6,-6,6,y,0.3,f>0?[stairHole(-3,4.8,1)]:[],COL.conL);
    for(const side of [0,1,2,3]){push(0,0,0,side*HP);wallRun(-5.7,5.7,5.85,0.3,y,3,f===0&&side===0?[{x:1.5,w:1.4,sill:0,top:2.3}]:side===3?[{x:0,w:3,sill:0.9,top:2.4}]:[{x:2,w:1.4,sill:0.9,top:2.3}],COL.con);pop();}
    stairs(-3,4.8,1,y,3,2,COL.conL);}
  slabR(-6,6,-6,6,15,0.3,[stairHole(-3,4.8,1)],COL.conD);
  box(-12,14.7,0,12,0.3,4,COL.conL);railL(-18,-2,-6,-2,15);railL(-18,2,-6,2,15);railL(-18,-2,-18,2,15);beamL([-6,13,1.6],[-14,14.7,1.6],0.3,0.4,COL.con,{nc:true});beamL([-6,13,-1.6],[-14,14.7,-1.6],0.3,0.4,COL.con,{nc:true});
  railL(-6,6,6,6,15);railL(6,-6,6,6,15);railL(-6,-6,6,-6,15);
  entrance(1.5,6,0,1,1.8);
  pop();
  XTRA.push(['Cliff lookout',x,g,z,270,'Five-storey lookout with a cantilevered deck over the dam gorge']);
}
// ================= DEEP UNDERGROUND NETWORK =================
const UNDER=[];let CIS_END=null;
function junction(x,z,y,sx,sz,sides,w,hh){
  w=w||3.2;hh=hh||3;push(x,y,z,0,{base:y});
  slabR(-sx/2,sx/2,-sz/2,sz/2,0,0.4,[],COL.conD);box(0,hh,0,sx+1,0.5,sz+1,COL.conD);
  const op=[{x:0,w,sill:0,top:hh-0.2}];
  wallRun(-sx/2-0.5,sx/2+0.5,-sz/2-0.25,0.5,-0.4,hh+0.4,sides.includes('n')?op:[],COL.con);
  wallRun(-sx/2-0.5,sx/2+0.5,sz/2+0.25,0.5,-0.4,hh+0.4,sides.includes('s')?op:[],COL.con);
  wallRunZ(-sz/2,sz/2,-sx/2-0.25,0.5,-0.4,hh+0.4,sides.includes('w')?op:[],COL.con);
  wallRunZ(-sz/2,sz/2,sx/2+0.25,0.5,-0.4,hh+0.4,sides.includes('e')?op:[],COL.con);
  box(0,hh-0.12,0,1.2,0.1,0.25,COL.lamp,{nc:true,e:true});
  pop();
}
// ascend from (ax,az,ya) along (dx,dz) to the surface
function shaft(ax,az,ya,dx,dz,w,slope,pav){
  let L=5,ok=0;for(let s=5;s<400;s+=0.5){const y=ya+s/slope;if(H(ax+dx*s,az+dz*s)<=y+0.2){ok++;if(ok>=6){L=s-2.5;break;}}else ok=0;}
  const ex=ax+dx*L,ez=az+dz*L,top=ya+L/slope;
  stairTunnel(ax,az,ya,ex,ez,top,w,3,{lamp:9});
  CUTS.push({x0:Math.min(ex,ex+dx*4)-w/2-0.55,x1:Math.max(ex,ex+dx*4)+w/2+0.55,z0:Math.min(ez,ez+dz*4)-w/2-0.55,z1:Math.max(ez,ez+dz*4)+w/2+0.55,y:top-0.05});
  if(pav){push(ex+dx*2.5,top,ez+dz*2.5,Math.atan2(dz,dx),{base:top});for(const a of [-2,2])for(const b of [-2.6,2.6])box(a,0,b,0.35,3.4,0.35,COL.con);box(0,3.4,0,6,0.35,7,COL.conL);box(0,3.75,0,4,0.9,0.2,COL.red,{nc:true});pop();}
  const sx=ex-dx*12,sz=ez-dz*12;reserve({x0:Math.min(sx,ex)-2,x1:Math.max(sx,ex)+2,z0:Math.min(sz,ez)-2,z1:Math.max(sz,ez)+2},'prop');
  return [ex,ez,top];
}
function manhole(x,z,yf){
  const top=H(x,z);
  push(x,yf,z,0,{base:yf});
  for(const [a,b,w,d] of [[0,-0.7,1.5,0.12],[0,0.7,1.5,0.12],[-0.7,0,0.12,1.5],[0.7,0,0.12,1.5]])box(a,2.6,b,w,top-yf-2.6,d,COL.conD,{nc:true});
  for(const dx of [-0.22,0.22])box(dx,0,-0.55,0.05,top-yf+1,0.05,COL.rust,{nc:true});for(let y=0.3;y<top-yf;y+=0.35)box(0,y,-0.55,0.44,0.04,0.04,COL.rust,{nc:true});
  pop();
  push(x,top,z,0);cyl(0,0,0,0.8,0.8,0.12,10,COL.dark,{open:false});pop();
  LADDERS.push({x,z:z-0.55,y0:yf,y1:top+0.12});
}
// ---------- underground pedestrian crossing ----------
function perekhod(x,z){
  const g=H(x,z),fy=g-4.8,hh=3,Hf=15,o=13;
  push(x,fy,z,0,{base:fy});
  slabR(-Hf,Hf,-Hf,Hf,0,0.4,[],COL.white);box(0,hh,0,Hf*2+1,0.5,Hf*2+1,COL.conD);
  const op=p=>[{x:p,w:3.2,sill:0,top:hh-0.2}];
  wallRunZ(-Hf,Hf,Hf+0.25,0.5,-0.4,hh+0.4,op(o),COL.white);wallRunZ(-Hf,Hf,-Hf-0.25,0.5,-0.4,hh+0.4,op(-o),COL.white);
  wallRun(-Hf-0.5,Hf+0.5,Hf+0.25,0.5,-0.4,hh+0.4,op(-o),COL.white);wallRun(-Hf-0.5,Hf+0.5,-Hf-0.25,0.5,-0.4,hh+0.4,op(o),COL.white);
  for(const a of [-5,5])for(const b of [-5,5])box(a,0,b,0.7,hh,0.7,COL.teal);
  for(const [a,b,r] of [[-8,Hf-0.6,0],[8,-Hf+0.6,PI],[Hf-0.6,-6,HP],[-Hf+0.6,6,-HP]]){push(a,0,b,r);box(0,0,0,3,2.4,1.2,COL.blue);box(0,1.1,0.62,2.6,1,0.04,COL.glass,{nc:true});pop();}
  for(const a of [-8,0,8])box(a,hh-0.12,0,1.2,0.1,0.25,COL.lamp,{nc:true,e:true});
  pop();
  for(const [ax,az,dx,dz] of [[x+Hf+0.5,z+o,1,0],[x-Hf-0.5,z-o,-1,0],[x-o,z+Hf+0.5,0,1],[x+o,z-Hf-0.5,0,-1]]){
    const L=shaftEnd(ax,az,fy,dx,dz,1.7);let bad=false;
    for(let s=0;s<=L+5;s+=1){const px=ax+dx*s,pz=az+dz*s;for(const r of ROADS){const [rx0,rz0,rx1,rz1]=r.p;if(Math.abs(rx0-rx1)>1&&Math.abs(rz0-rz1)>1)continue;const hw=r.w/2+3.2;
      if(px>Math.min(rx0,rx1)-hw&&px<Math.max(rx0,rx1)+hw&&pz>Math.min(rz0,rz1)-hw&&pz<Math.max(rz0,rz1)+hw){const through=(Math.abs(rz0-rz1)<1?Math.abs(rz0-z)<1:Math.abs(rx0-x)<1);if(!through||s>8){bad=true;break;}}}if(bad)break;}
    if(bad){push(x,fy,z,0);box(ax-x-dx*0.6,0,az-z-dz*0.6,dx?0.4:3.4,hh,dz?0.4:3.4,COL.white);pop();continue;}
    shaft(ax,az,fy,dx,dz,3,1.7);PK_SHAFTS.push([x,z,ax,az,dx,dz,fy]);
  }
}
const PK_SHAFTS=[];
// ---------- Object 245: deep command bunker ----------
function object245(){
  const X=110,Z=-30,Y=-60,Hh=8;
  push(X,Y,Z,0,{base:Y});
  slabR(-30,30,-20,20,0,0.6,[],COL.conD);box(0,Hh,0,61.6,1.2,41.6,COL.conD);
  {const sv=NORNG;NORNG=true;try{box(-30.7,-0.6,10,1.6,0.6,3.8,COL.conD,{});}finally{NORNG=sv;}}
  wallRun(-30.8,30.8,-20.4,0.8,-0.6,Hh+0.6,[{x:-1,w:2.4,sill:0,top:2.6}],COL.con);
  wallRun(-30.8,30.8,20.4,0.8,-0.6,Hh+0.6,[],COL.con);
  wallRunZ(-20,20,-30.4,0.8,-0.6,Hh+0.6,[{x:10,w:3.2,sill:0,top:3}],COL.con);
  wallRunZ(-20,20,30.4,0.8,-0.6,Hh+0.6,[{x:10,w:3.2,sill:0,top:3}],COL.con);
  for(const [a,b] of [[-30.4,10],[30.4,10]])for(const d of [-2.4,2.4])box(a,0,b+d,1.6,3.6,0.9,COL.steel);
  box(-1,0,-21,4.6,3.4,1.2,COL.steel,{nc:true});
  // spine corridor walls
  const cops=[];for(let x=-24;x<=24;x+=8)cops.push({x,w:1.2,sill:0,top:2.2});
  wallRun(-30,30,7,0.3,0,Hh,cops.concat([{x:-1,w:6,sill:0,top:3}]),COL.white);
  wallRun(-30,30,13,0.3,0,Hh,cops,COL.white);
  // command hall
  box(-15,0,-16,14,1,4,COL.con);for(let i=0;i<3;i++)box(-20+i*5,1,-16,3.6,1,1.2,COL.steel);
  box(0,1.5,-19.85,26,5,0.15,COL.mosaicB,{nc:true});for(let i=0;i<8;i++)box(rnd(-12,12),rnd(2,6),-19.7,rnd(1,5),0.12,0.05,COL.red,{nc:true});
  for(let r=0;r<3;r++)for(let i=0;i<6;i++)box(-14+i*5.6,0,-8+r*4,3,0.9,1,COL.steel);
  for(const a of [-20,-10,10])for(const b of [-12,0])box(a,0,b,0.9,Hh,0.9,COL.con);
  // generator hall
  wallRunZ(-20,7,18,0.4,0,Hh,[{x:-3,w:2.4,sill:0,top:3}],COL.con);
  for(let i=0;i<2;i++){box(24,0,-14+i*10,8,3,4,COL.green);cyl(24,3,-14+i*10,1.2,1.2,2,10,COL.steel);}
  cyl(24,0,4,1.6,1.6,5,10,COL.rust,{coll:true});
  // dormitories
  for(let x=-30;x<30;x+=7.5){if(x>-30)wallRunZ(13,20,x,0.2,0,Hh,[],COL.white);for(let k=0;k<2;k++){box(x+2,0,15+k*2.8,2,0.5,0.9,COL.steel);box(x+2,1.6,15+k*2.8,2,0.1,0.9,COL.steel,{nc:true});}}
  for(let x=-24;x<=24;x+=8)box(x,Hh-0.15,10,1.6,0.12,0.3,COL.lamp,{nc:true,e:true});
  for(let x=-15;x<=15;x+=10)box(x,Hh-0.15,-8,1.6,0.12,0.3,COL.lamp,{nc:true,e:true});
  pop();
}
// ---------- deep stair shaft from Tower 245 corridor ----------
function towerShaft(){
  const xc=109,zl=-76.5,yT=-6-13*((-77+114.8)/164.2),yB=-60,n=17,fh=(yT-yB)/n;
  tube(101.95,-77,yT,107.25,-77,yT,1.4,2.4,{lamp:4});
  for(let f=0;f<n;f++){const y=yB+f*fh;
    slabR(107.3,110.7,-82.6,-76.4,y,0.3,f>0?[stairHole(xc,zl,1)]:[],COL.conD);
    stairs(xc,zl,1,y,fh,2,COL.conL);
    wallRunZ(-82.6,-76.4,107.15,0.3,y,fh,[],COL.con);wallRunZ(-82.6,-76.4,110.85,0.3,y,fh,[],COL.con);
    wallRun(106.9,111.1,-82.75,0.3,y,fh,[],COL.con);wallRun(106.9,111.1,-76.25,0.3,y,fh,f===0?[{x:109,w:2,sill:0,top:2.3}]:[],COL.con);
    if(f%3===0)box(xc,y+fh-0.3,-79.5,0.8,0.1,0.25,COL.lamp,{nc:true,e:true});}
  slabR(107.3,110.7,-82.6,-76.4,yT,0.3,[stairHole(xc,zl,1)],COL.conD);
  wallRunZ(-82.6,-76.4,107.15,0.3,yT,2.8,[{x:-77,w:1.3,sill:0,top:2.3}],COL.con);wallRunZ(-82.6,-76.4,110.85,0.3,yT,2.8,[],COL.con);
  wallRun(106.9,111.1,-82.75,0.3,yT,2.8,[],COL.con);wallRun(106.9,111.1,-76.25,0.3,yT,2.8,[],COL.con);box(109,yT+2.8,-79.5,4.4,0.3,6.8,COL.conD);
  tube(109,-75.95,yB,109,-50.8,yB,2.0,2.6,{lamp:8});
}
// ---------- cistern ----------
function shaftEnd(ax,az,ya,dx,dz,slope){let ok=0;for(let s=5;s<400;s+=0.5){const y=ya+s/slope;if(H(ax+dx*s,az+dz*s)<=y+0.2){ok++;if(ok>=6)return s-2.5;}else ok=0;}return 60;}
function corridorClear(ax,az,dx,dz,L,w){for(let s=Math.max(0,L-18);s<=L+6;s+=2){const x=ax+dx*s,z=az+dz*s;const a={x0:x-w,x1:x+w,z0:z-w,z1:z+w};for(const f of FOOT){if(f.tag==='road'||f.tag==='hwy'||f.tag==='ent')continue;if(a.x0<f.x1&&a.x1>f.x0&&a.z0<f.z1&&a.z1>f.z0)return false;}if(z>-704&&Math.abs(x-riverX(z))<riverHalf(z).top+4)return false;}return true;}
function cistern(){
  const X=-505,Z=-250,Y=-25,Hh=9;
  const cands=[{side:'n',ax:X,az:Z-30.75,dx:0,dz:-1},{side:'w',ax:X-20.75,az:Z-10,dx:-1,dz:0},{side:'e',ax:X+20.75,az:Z-10,dx:1,dz:0}];
  let ch=cands[0];for(const c of cands){const L=shaftEnd(c.ax,c.az,Y+1.2,c.dx,c.dz,1.73);if(corridorClear(c.ax,c.az,c.dx,c.dz,L,4)){ch=c;break;}}
  push(X,Y,Z,0,{base:Y});
  slabR(-20,20,-30,30,0,0.6,[],COL.wet);box(0,Hh,0,41,1,61,COL.conD);
  const dn=ch.side==='n'?[{x:0,w:3.2,sill:1.8,top:4.6}]:[];
  wallRun(-20.5,20.5,30.25,0.5,-0.6,Hh+0.6,[{x:0,w:3.2,sill:0,top:3}],COL.con);
  wallRun(-20.5,20.5,-30.25,0.5,-0.6,Hh+0.6,dn,COL.con);
  wallRunZ(-30,30,-20.25,0.5,-0.6,Hh+0.6,ch.side==='w'?[{x:-10,w:3.2,sill:1.8,top:4.6}]:[],COL.con);
  wallRunZ(-30,30,20.25,0.5,-0.6,Hh+0.6,ch.side==='e'?[{x:-10,w:3.2,sill:1.8,top:4.6}]:[],COL.con);
  for(let x=-15;x<=15;x+=6)for(let z=-25;z<=25;z+=6){box(x,0,z,1,Hh,1,COL.con);box(x,Hh-1.2,z,1.8,1.2,1.8,COL.con,{nc:true});}
  box(-17.5,0,0,5,1.2,60,COL.conL);box(17.5,0,-10,5,1.2,8,COL.conL);box(0,0,-27.5,40,1.2,5,COL.conL);
  railL(-15,-22,-15,30,1.2,COL.rust);flight(0,-21.6,0,0,-25,1.2,3,COL.conL,'m');flight(-11.6,-20,0,-15,-20,1.2,3,COL.conL,'m');flight(17.5,-1,0,17.5,-5.8,1.2,3,COL.conL,'m');
  waterL(-15,15,-25,30,0.55);
  for(let z=-24;z<=24;z+=8)box(-19.6,Hh-1.5,z,0.2,0.3,1.2,COL.lamp,{nc:true,e:true});
  pop();
  tube(-505,74.4,-19,-505,-219.4,-25,3.2,3,{lamp:15});
  return shaft(ch.ax+ch.dx*0.3,ch.az+ch.dz*0.3,Y+1.2,ch.dx,ch.dz,3,1.73,true);
}
// ---------- metro loop: links joining line 1 and line 2 into one continuous track ----------
const METRO_LOOP=[],METRO_SWITCH=[];
// traction breaker cabinet: built on the generator hall's real floor (after places are corrected), with the place set just in front of it
function placeBreaker(){const hall=UNDER.find(u=>u[0]==='Object 245 generator hall'),bp=UNDER.find(u=>u[0]==='Object 245: traction breakers');if(!hall)return;
  const px=hall[1],py=hall[2],pz=hall[3],sv=NORNG;NORNG=true;try{let pick=null;
    for(const r of [1.4,2.0,2.8])for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[0.7,0.7],[-0.7,0.7],[0.7,-0.7],[-0.7,-0.7]]){if(pick)break;const x=px+dx*r,z=pz+dz*r;if(Math.abs(groundAt(x,z,py+0.5)-py)>0.15)continue;
      let free=true;for(const L of cellList(x,z))if(!L.ramp&&L.y1>py+0.2&&L.y0<py+2.2){const ddx=x-L.cx,ddz=z-L.cz,u=ddx*L.c+ddz*L.s,v=-ddx*L.s+ddz*L.c;if(Math.abs(u)<L.hx+0.7&&Math.abs(v)<L.hz+0.7){free=false;break;}}
      if(free)pick=[x,z,Math.atan2(-dz,-dx)];}
    if(!pick)pick=[px,pz,0];
    push(pick[0],py,pick[1],pick[2]);box(0,0,0,0.45,1.9,1.1,[0.36,0.4,0.36],{m:MAT.metalPaint});box(0.24,1.2,0,0.04,0.5,0.7,[0.2,0.2,0.2],{nc:true});
    box(0.26,1.05,-0.3,0.06,0.25,0.06,COL.steel,{nc:true});box(0.27,1.55,0.25,0.03,0.08,0.08,[0.55,0.1,0.08],{nc:true});box(0.27,1.65,0.25,0.03,0.08,0.08,[0.12,0.4,0.15],{nc:true});
    for(let i=0;i<4;i++)beamL([0,1.9,-0.4+i*0.25],[0,2.9+i*0.05,-0.4+i*0.25],0.03,0.03,COL.dark,{nc:true,flat:true});
    pop();METRO_SWITCH.length=0;METRO_SWITCH.push(pick[0],py,pick[1],pick[2]);
    if(bp){const fx=Math.cos(pick[2]),fz=Math.sin(pick[2]);bp[1]=pick[0]+fx*1.2;bp[2]=py;bp[3]=pick[1]+fz*1.2;bp[4]=((Math.atan2(-fx,fz)*180/Math.PI)+360)%360;}}finally{NORNG=sv;}}
function crPath(pts,step){const out=[];for(let i=0;i<pts.length-1;i++){const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
    const L=Math.hypot(p2[0]-p1[0],p2[1]-p1[1]),n=Math.max(1,Math.ceil(L/step));
    for(let k=0;k<n;k++){const t=k/n,t2=t*t,t3=t2*t,f=(a,b,c,d)=>0.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);out.push([f(p0[0],p1[0],p2[0],p3[0]),f(p0[1],p1[1],p2[1],p3[1]),f(p0[2],p1[2],p2[2],p3[2])]);}}
  out.push(pts[pts.length-1].slice());return out;}
function loopTunnel(pts){const P=crPath(pts,9);const sv=NORNG;NORNG=true;try{let dist=0;
  for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1])||1,ux=(b[0]-a[0])/L,uz=(b[1]-a[1])/L,ex=0.6;
    tube(a[0]-ux*ex,a[1]-uz*ex,a[2],b[0]+ux*ex,b[1]+uz*ex,b[2],12,6,{rails:true,lamp:0});
    if(Math.abs(a[2]-b[2])>=0.01)for(const tz of [-2.5,2.5])for(const r of [-0.75,0.75]){const o=tz+r;beamL([a[0]-uz*o-ux*0.62,a[2]+0.08,a[1]+ux*o-uz*0.62],[b[0]-uz*o+ux*0.62,b[2]+0.08,b[1]+ux*o+uz*0.62],0.08,0.16,COL.steel,{nc:true});}
    const mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2,my=(a[2]+b[2])/2,ang=Math.atan2(uz,ux);
    // cable trays along the wall, dead and living lamps, water and rubble on the track bed
    push(mx,my,mz,ang);box(0,3.6,-5.7,L+1.2,0.05,0.35,COL.steel,{nc:true,mat:6});box(0,3.75,-5.8,L+1.2,0.08,0.08,COL.dark,{nc:true,mat:6});box(0,3.9,-5.75,L+1.2,0.06,0.06,[0.25,0.18,0.12],{nc:true,mat:6});
    const hs=((Math.sin(mx*12.9898+mz*78.233)*43758.5453)%1+1)%1;
    if(Math.floor(dist/30)!==Math.floor((dist+L)/30)){const live=hs>0.45;box(0,5.2,-5.6,0.8,0.18,0.3,live?COL.lamp:[0.2,0.2,0.18],{nc:true,e:live});box(0,5.38,-5.6,0.1,0.25,0.1,COL.steel,{nc:true,mat:6});}
    if(hs<0.16)WATER.push({x0:mx-1.6,x1:mx+1.6,z0:mz-1.6,z1:mz+1.6,y:my+0.03});
    if(hs>0.9){box(1.2*(hs-0.95)*20,0,3.6,0.7,0.35,0.6,COL.conD,{mat:6});box(-0.8,0,4.2,0.5,0.22,0.4,COL.con,{nc:true,mat:6});}
    pop();dist+=L;}
}finally{NORNG=sv;}return P;}
const METRO_STOPS=[];
function compactMetro(){const Y=-42,YC=-45,st=[{c:[0,-260],ry:0,side:-1,out:[0,-1],name:'North'},{c:[260,0],ry:HP,side:-1,out:[1,0],name:'East'},{c:[0,260],ry:0,side:1,out:[0,1],name:'South'},{c:[-260,0],ry:HP,side:1,out:[-1,0],name:'West'}];
  // escalator shaft surface mouths reserved first so blocks fill around them
  for(const S of st){const dx=25*Math.cos(S.ry),dz=25*Math.sin(S.ry),mx=S.c[0]+dx+S.out[0]*90,mz=S.c[1]+dz+S.out[1]*90;reserve({x0:mx-7,x1:mx+7,z0:mz-7,z1:mz+7},'ent');}
  for(const S of st){station(S.c[0],S.c[1],{y:Y,ry:S.ry,doors:S.name==='North'?[{side:S.side,x:25},{side:-S.side,x:-25}]:[{side:S.side,x:25}],train:false});METRO_STOPS.push(S.c.slice());
    const dx=25*Math.cos(S.ry),dz=25*Math.sin(S.ry),ax=S.c[0]+dx+S.out[0]*10.6,az=S.c[1]+dz+S.out[1]*10.6,bx=ax+S.out[0]*82,bz=az+S.out[1]*82,top=H(bx,bz);
    {const sv=NORNG;NORNG=true;try{const tx=S.c[0]+dx+S.out[0]*10.2,tz=S.c[1]+dz+S.out[1]*10.2;push(tx,Y,tz,Math.atan2(S.out[1],S.out[0]));box(0,0,0,1.8,1.0,4.4,COL.conD,{});pop();}finally{NORNG=sv;}}
    tube(ax-S.out[0]*0.6,az-S.out[1]*0.6,Y+1,ax+S.out[0]*4,az+S.out[1]*4,Y+1,4.4,3.4,{lamp:6});
    stairTunnel(ax+S.out[0]*4,az+S.out[1]*4,Y+1,bx,bz,top,4.4,3.4,{lamp:10});
    const sv=NORNG;NORNG=true;try{push(bx+S.out[0]*3,top,bz+S.out[1]*3,Math.atan2(S.out[1],S.out[0]));for(const a of [-2.6,2.6])for(const b of [-3,3])box(b,0,a,0.35,3.2,0.35,COL.con);box(0,3.2,0,7.2,0.35,6.4,COL.conL);box(-3.4,0,0,0.3,1.1,6.0,COL.con);pop();}finally{NORNG=sv;}
    UNDER.push(['Metro: '+S.name+' station',S.c[0],Y+1,S.c[1]+(S.ry?0:7),0,'Deep loop station, '+(-Y)+' m down']);}
  // Tower 245 -> stair shaft -> Object 245 bunker -> pedestrian link to North station's inner door
  object245();towerShaft();tube(100,-114.8,-6,100,-76.4,-6-13*((-77+114.8)/164.2),3.2,3,{lamp:8});
  {const sv=NORNG;NORNG=true;try{push(-25,Y,-249.8,Math.PI/2);box(0,0,0,1.8,1.0,4.4,COL.conD,{});pop();}finally{NORNG=sv;}}
  tube(-25,-250.4,Y+1,-25,-246,Y+1,3.6,3.2,{lamp:6});tube(-25,-246,Y+1,79.2,-20,-60,3.6,3.2,{lamp:12});
  UNDER.push(['Link to Object 245',20,-50,-140,90,'Pedestrian tunnel from North station to the bunker']);
  // the loop: station straights joined by curved, slightly deeper tunnels
  const legs=[[[50,-260,Y],[150,-262,YC],[232,-232,YC],[262,-150,YC],[260,-50,Y]],[[260,50,Y],[262,150,YC],[232,232,YC],[150,262,YC],[50,260,Y]],
    [[-50,260,Y],[-150,262,YC],[-232,232,YC],[-262,150,YC],[-260,50,Y]],[[-260,-50,Y],[-262,-150,YC],[-232,-232,YC],[-150,-262,YC],[-50,-260,Y]]];
  const lin=(a,b,n)=>{const o=[];for(let i=0;i<n;i++){const t=i/n;o.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);}return o;};
  const straights=[[[-50,-260,Y],[50,-260,Y]],[[260,-50,Y],[260,50,Y]],[[50,260,Y],[-50,260,Y]],[[-260,50,Y],[-260,-50,Y]]];
  for(let i=0;i<4;i++){for(const p of lin(straights[i][0],straights[i][1],10))METRO_LOOP.push(p);const P=loopTunnel(legs[i]);for(const p of P.slice(0,-1))METRO_LOOP.push(p);}
  metroDetail(st.map(S=>[S.c[0],S.c[1],S.ry,Y]));
  // traction substation alcove on North station's platform
  {const sv=NORNG;NORNG=true;try{const S=st[0];push(S.c[0]+40,Y+1,S.c[1]-8.6,Math.PI/2);box(0,0,0,0.45,1.9,1.1,[0.36,0.4,0.36],{m:MAT.metalPaint});box(0.27,1.55,0.25,0.03,0.08,0.08,[0.55,0.1,0.08],{nc:true});box(0.27,1.65,0.25,0.03,0.08,0.08,[0.12,0.4,0.15],{nc:true});pop();
    METRO_SWITCH.length=0;METRO_SWITCH.push(S.c[0]+40,Y+1,S.c[1]-8.6,Math.PI/2);UNDER.push(['Metro traction substation',S.c[0]+40,Y+1,S.c[1]-7.4,180,'Restore power to the metro here']);}finally{NORNG=sv;}}
}
function buildMetroLoop(){
  const south=[[382,140,-20],[410,140,-20.5],[440,170,-21.5],[455,230,-23],[450,320,-25],[420,400,-27.5],[350,450,-30],[250,470,-32.5],[130,470,-35],[40,445,-37],[-10,410,-38],[-20,380,-38]];
  const north=[[-20,-380,-35],[-20,-410,-34.5],[-45,-445,-33.5],[-110,-470,-32.5],[-220,-478,-31],[-340,-462,-29.5],[-450,-420,-28],[-560,-330,-26.5],[-600,-200,-25],[-605,-80,-23.5],[-600,20,-21.2],[-575,80,-20.2],[-530,85,-20]];
  const A=loopTunnel(south),B=loopTunnel(north);
  // full ordered loop for a future train: south link, line 2 north, north link, line 1 east
  const l2=[[-20,380,-38],[-20,280,-38],[-20,30,-41],[-20,-70,-41],[-20,-280,-35],[-20,-380,-35]];
  const l1=[[-530,85,-20],[-430,85,-20],[50,60,-20],[150,60,-20],[250,140,-20],[350,140,-20],[382,140,-20]];
  const lin=(pts,st)=>{const out=[];for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/st));for(let k=0;k<n;k++){const t=k/n;out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);}}out.push(pts[pts.length-1].slice());return out;};
  for(const seg of [A,lin(l2,10).slice(1),B.slice(1),lin(l1,10).slice(1,-1)])for(const p of seg)METRO_LOOP.push(p);
  metroDetail();
}
// sleepers under both tracks all round the loop; evacuation litter on the platforms
let SLEEPERS=0;
function metroDetail(stations){const sv=NORNG;NORNG=true;try{const L=METRO_LOOP,SL=[0.42,0.41,0.38];let carry=0;
  for(let i=0;i<L.length;i++){const a=L[i],b=L[(i+1)%L.length],d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(d<0.01)continue;const ux=(b[0]-a[0])/d,uz=(b[1]-a[1])/d,ang=Math.atan2(uz,ux);
    for(let t=carry;t<d;t+=0.75){const x=a[0]+ux*t,z=a[1]+uz*t,y=a[2]+(b[2]-a[2])*t/d;for(const tz of [-2.5,2.5]){push(x-uz*tz,y,z+ux*tz,ang);box(0,0,0,0.26,0.07,2.3,SL,{nc:true,mat:6,flat:true});pop();SLEEPERS++;}carry=t+0.75-d;}
  }
  const ST=stations||[[-480,85,0,-20],[100,60,0,-20],[300,140,0,-20],[-20,-330,HP,-35],[-20,330,HP,-38]];
  const hs=(a,b,c)=>((Math.sin(a*12.9898+b*78.233+c*37.719)*43758.5453)%1+1)%1;
  const BAG=[[0.3,0.24,0.2],[0.42,0.18,0.15],[0.22,0.26,0.32],[0.35,0.3,0.22]],PAPER=[0.78,0.76,0.7];
  for(const [cx,cz,ry,yb] of ST){push(cx,0,cz,ry,{base:yb});
    for(let i=0;i<46;i++){const r1=hs(cx,cz,i),r2=hs(cz,i,cx),r3=hs(i,cx,cz),s=r1<0.5?-1:1,x=-42+r2*84,z=s*(6.5+r3*3.0),y=yb+1;
      const kind=Math.floor(hs(i*3,cx,1)*10),ang=hs(i,7,cz)*PI;push(x,y,z,ang);
      if(kind<4){box(0,0,0,0.42,0.008,0.3,PAPER,{nc:true,mat:6,flat:true});box(0.35,0,0.2,0.3,0.006,0.22,[0.7,0.68,0.6],{nc:true,mat:6,flat:true});}
      else if(kind<6){const c=BAG[i%4];box(0,0,0,0.45,0.3,0.25,c,{mat:6,flat:true,m:MAT.fabric});box(0,0.3,0,0.2,0.08,0.03,COL.dark,{nc:true,mat:6,flat:true});}
      else if(kind<7){box(0,0,0,0.7,0.22,0.48,[0.33,0.25,0.18],{mat:6,flat:true});box(0.36,0.06,0,0.03,0.1,0.18,COL.steel,{nc:true,mat:6,flat:true});}
      else if(kind<8){box(0,0,0,0.6,0.02,0.4,[0.62,0.6,0.55],{nc:true,mat:6,flat:true});box(0,0.02,0,0.5,0.004,0.3,[0.5,0.18,0.14],{nc:true,mat:6,flat:true});}
      else if(kind<9){box(0,0,0,0.12,0.12,0.12,[0.5,0.48,0.4],{nc:true,mat:6,flat:true});box(0.4,0,0.1,0.28,0.1,0.18,COL.dark,{nc:true,mat:6,flat:true});}
      else{box(0,0,0,1.2,0.04,0.5,COL.white,{nc:true,mat:6,flat:true});}
      pop();}
    pop();}
}finally{NORNG=sv;}
}
function deepUnderground(){
  // metro line 2 (north-south, deep)
  station(-20,-20,{y:-41,ry:HP,doors:[{side:-1,x:47},{side:-1,x:0}]});
  station(-20,-330,{y:-35,ry:HP,doors:[{side:-1,x:10}],closedW:true,loopOpen:true,train:true});
  station(-20,330,{y:-38,ry:HP,doors:[{side:-1,x:-10}],closedE:true,loopOpen:true});
  tube(-20,-70,-41,-20,-280,-35,12,6,{rails:true,lamp:25});
  tube(-20,30,-41,-20,280,-38,12,6,{rails:true,lamp:25});
  const n2=shaft(-9.4,-320,-34,1,0,3.4,1.73,true),s2=shaft(-9.4,320,-37,1,0,3.4,1.73,true);
  // interchange line 1 <-> line 2
  tube(70,49.4,-19,70,30.4,-19,3.2,3,{lamp:8});junction(70,27,-19,6.8,6.8,['s','w']);
  tube(66.4,27,-19,-9.4,27,-40,3.2,3,{lamp:10,wallC:COL.white});
  // Object 245 and links
  object245();towerShaft();
  tube(-9.4,-20,-40,79.2,-20,-60,3.2,3,{lamp:10});
  tube(140.8,-20,-60,236.6,-20,-60,3.6,3.2,{lamp:18});junction(240,-20,-60,6.8,6.8,['w','e','n']);
  tube(243.4,-20,-60,266.6,-20,-50,3.2,3,{lamp:10});junction(270,-20,-50,6.8,6.8,['w','s']);
  tube(270,-16.6,-50,270,129.4,-19,3.2,3,{lamp:15});
  tube(240,-23.4,-60,240,-501.6,-14,3.6,3.2,{lamp:18});junction(240,-505,-14,6.8,6.8,['s','e']);
  tube(243.4,-505,-14,317.4,-505,-8,3.2,3,{lamp:10});
  // heating collector ring under the central ring road + storm drain
  const C=[[-200,-205],[200,-205],[200,200],[-200,200]],Y=C.map(([x,z])=>H(x,z)-12);
  for(let i=0;i<4;i++){const [x,z]=C[i];junction(x,z,Y[i],4.4,4.4,i===0?['e','s']:i===1?['w','s']:i===2?['n','w']:['n','e'],2.2,2.5);manhole(x,z+1.2,Y[i]);}
  tube(-197.8,-205,Y[0],197.8,-205,Y[1],2.2,2.5,{lamp:20,wallC:COL.conD});
  tube(200,-202.8,Y[1],200,197.8,Y[2],2.2,2.5,{lamp:20,wallC:COL.conD});
  tube(197.8,200,Y[2],-197.8,200,Y[3],2.2,2.5,{lamp:20,wallC:COL.conD});
  tube(-200,197.8,Y[3],-200,-202.8,Y[0],2.2,2.5,{lamp:20,wallC:COL.conD,gaps:[{side:-1,a:-4.2,b:-0.8}]});
  for(const [x,z,ya,yb] of [[0,-205,Y[0],Y[1]],[200,-100,Y[1],Y[2]],[0,200,Y[2],Y[3]],[-200,-100,Y[3],Y[0]]])manhole(x,z,lerp(ya,yb,0.5));
  const yo=lerp(Y[3],Y[0],200/405),rx=riverX(0),bed=-riverDepth(0)+0.4;
  stairTunnel(-201.6,0,yo,rx+21,0,bed,2.4,2.6,{floor:'ramp',lamp:25,wallC:COL.conD});
  CUTS.push({x0:rx+15,x1:rx+28,z0:-3,z1:3,y:bed-0.4});
  push(rx+21,bed,0,0);box(-0.5,-0.5,-3.4,1,4.2,2,COL.con);box(-0.5,-0.5,3.4,1,4.2,2,COL.con);box(-0.5,2.8,0,1,1,8.8,COL.con);pop();
  // underground crossings at arterial junctions
  for(const [x,z] of [[-440,100],[-440,-260],[-90,-260],[-90,100],[200,100],[200,-260],[-200,100]])perekhod(x,z);
  const cs=cistern();CIS_END=cs;buildMetroLoop();

  UNDER.push(
    ['Metro line 2, Square station (deep)',-20,-40,-20,0,'40 m down; interchange to line 1, blast door to Object 245'],
    ['Metro line 2, North station',-20,-34,-310,180,'Deep station; escalator shaft to the north residential streets'],
    ['Metro line 2, South station',-20,-37,340,0,'Deep station under the market quarter'],
    ['Interchange passage',40,-28,27,270,'Inclined passage between line 1 and line 2'],
    ['Object 245 command hall',110,-60,-38,0,'Deep civil-defence bunker 60 m under the centre'],
    ['Object 245 generator hall',124,-60,-5,0,'Generators and fuel tank'],
    ['Tower 245 deep stair shaft',108,-8.6,-77.5,90,'17 storeys of stairs from the tower corridor down to Object 245'],
    ['Evacuation tunnel (to industry)',200,-60,-20,90,'Service tunnel to the industrial station'],
    ['Evacuation tunnel (to north bunker)',240,-36,-260,180,'Long incline to the north bunker'],
    ['Heating collector',-200,null,-100,180,'Utility tunnel ring under the central ring road; manhole ladders at the junctions'],
    ['Storm drain outlet',rx+24,bed+0.1,0,90,'Collector mouth in the riverbed embankment'],
    ['Underground crossing',-90,H(-90,-260)-4.8,-260,0,'Pedestrian subway under North Avenue'],
    ['Cistern',-515,-25,-250,0,'Columned water reservoir, linked to West metro station'],
    ['Survivors\' flat',0,0,0,0,'Candles still burning in one room'],
    ['Object 245: traction breakers',124,-60,-5,90,'Restore power to the metro here'],
    ['Metro loop: southern link',450,-24.4,300,180,'New tunnel joining line 1 to line 2 under the industrial zone'],
    ['Metro loop: northern link',-340,-28.9,-462,90,'New tunnel joining line 2 to line 1 under the reservoir and river'],
  );
}

const DECALS=[];let DS=4242;const DR=()=>(DS=(DS*16807)%2147483647)/2147483647;
function makeDecals(){
  const add=(x,y,z,nx,nz,w,h,tile,L)=>DECALS.push([x,y,z,nx,nz,w,h,tile,L]);
  // station name plates on the plaques above the platform mosaics
  for(const [cx,cz,ry,yb,tile] of (CMPT?[[0,-260,0,-42,13],[260,0,HP,-42,12],[0,260,0,-42,14],[-260,0,HP,-42,10]]:[[-480,85,0,-20,10],[100,60,0,-20,11],[300,140,0,-20,12],[-20,-330,HP,-35,13],[-20,330,HP,-38,14]])){const c=Math.cos(ry),s=Math.sin(ry);
    for(let lx=-40;lx<=40;lx+=20)for(const sg of [-1,1]){const lz=sg*(10-0.185),wx=cx+lx*c-lz*s,wz=cz+lx*s+lz*c;add(wx,yb+6.0,wz,sg*s,-sg*c,2.9,1.12,tile,0.6);}}
  for(const S of SLABS){const r=DR();if(r>0.45||S.n<5)continue;const c=Math.cos(S.ry),s=Math.sin(S.ry),side=DR()<0.5?1:-1;
    const lx=side*(S.L/2+0.025),wx=S.x+lx*c,wz=S.z+lx*s,hgt=Math.min(S.n*3-4,13),w=Math.min(11,hgt);
    if(r>0.34)continue;const tile=r<0.15?0:r<0.26?1:15,sz=w;
    if(WG_FREE(wx+c*side*2,wz+s*side*2)&&WG_FREE(wx+c*side*5,wz+s*side*5)&&WG_FREE(wx+c*side*9,wz+s*side*9))add(wx,S.base+3.2+sz/2,wz,c*side,s*side,sz,sz,tile,1);}
  for(const k of KD){if(k[7]&1)continue;const c=Math.cos(k[3]),s=Math.sin(k[3]),sd=k[8]>=k[9]?1:-1,L=Math.max(k[8],k[9]),nx=-s*sd,nz=c*sd,Wc=k[10];
    const cx=k[0]+c*Wc/2+nx*(k[6]/2+0.03),cz=k[2]+s*Wc/2+nz*(k[6]/2+0.03),top=k[1]+k[5];
    const nearShelter=Math.hypot(k[0]-10,k[2]+160)<30||Math.hypot(k[0]-330,k[2]+505)<20||Math.hypot(k[0]-110,k[2]+30)<45;
    if(nearShelter&&k[1]<-2&&DR()<0.8){add(cx,top+0.55,cz,nx,nz,1.8,1.8,9,L);continue;}
    if(k[1]<-3){if(DR()<0.3)add(cx,top+0.5,cz,nx,nz,1.5,1.5,8,L);continue;}
    if(L>=1&&k[14]===12){const g=H(cx+nx*1.5,cz+nz*1.5);if(Math.abs(k[1]-g)<1.2&&DR()<0.5){add(cx,top+0.55,cz,nx,nz,1.7,1.7,3+Math.floor(DR()*4),L);continue;}}
    if(k[14]===12&&k[0]>205&&k[2]<365&&k[2]>-250&&DR()<0.3){add(cx+c*(Wc/2+0.9),k[1]+1.4,cz+s*(Wc/2+0.9),nx,nz,1.3,1.3,7,L);continue;}
  }
}
function WG_FREE(x,z){const L=cellList(x,z);for(const o of L){if(o.hx*o.hz<1)continue;const dx=x-o.cx,dz=z-o.cz,u=dx*o.c+dz*o.s,v=-dx*o.s+dz*o.c;if(Math.abs(u)<o.hx&&Math.abs(v)<o.hz&&o.y1>H(x,z)+3)return false;}return true;}
const WG={METRO_STOPS,COMPACT:CMPT,SDET,LOGIC,FIRES,PERCH,STORY,get WEEDS(){return WEEDS},get BLASTS(){return BLASTS},lightAt:(x,y,z)=>INDOOR_AT?INDOOR_AT(x,y,z):1,get PLACES_FIXED(){return PLACES_FIXED},get SLEEPERS(){return SLEEPERS},get BALU(){return BALU},get RAILED(){return RAILED},METRO_SWITCH,METRO_LOOP,buildWorldGen,finishStep,get APRONS(){return APRONS},get CLEARED(){return CLEARED},BRIDGES,get PAVED(){return PAVED},get BRICKED(){return BRICKED},get BALC(){return BALC},get TREES(){return TREES},LIFTS,HALLS,addSolid,SAFE,DECALS,KW,KD,FR,coveredAt:(x,y,z)=>{const L=cellList(x,z);for(const o of L){if(o.ramp||o.y0<y+0.3||o.y0>y+25||o.hx*o.hz<1)continue;const dx=x-o.cx,dz=z-o.cz,u=dx*o.c+dz*o.s,v=-dx*o.s+dz*o.c;if(Math.abs(u)<o.hx&&Math.abs(v)<o.hz)return true;}return false;},XTRA,RPROF,get TLEV(){return TLEV},FINE_MARK,FLIGHTS,inHole,HOLES,TUBES,TH:(x,z)=>THS?(inHole(x,z)?-1e9:meshH(x,z)):H(x,z),meshH,BPADS,PK_SHAFTS,get CIS(){return CIS_END},CUTSX:CUTS,ROAD_TUNNELS,SPIRALS,UNDER,TOWERS,SLABS,CIVIC,HASH,hk,HS:8,buildWorld,BUCK,WATER,LADDERS,H,groundAt,pushOut,districtAt,cellName,riverX,riverHalf,DISTRICTS,ROADS,FOOT,T245,STATS,COL};
if(typeof module!=='undefined')module.exports=WG;

