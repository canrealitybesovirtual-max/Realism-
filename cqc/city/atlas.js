function cityAtlas(){
  // DESIGN RULE: no large-pixel textures. Every tile is 256 px, smoothly filtered, with real surface detail.
  const T=256,W=T*8,Hh=T*4,im={data:new Uint8Array(W*Hh*4)};const D=im.data;
  let seed=1;const rr=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const hash=(i,j,s)=>{let h=(i*374761393+j*668265263+s*1442695041)|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;};
  const vn=(px,py,sc,s)=>{const n=T/sc,fx=px/sc,fy=py/sc,i=Math.floor(fx),j=Math.floor(fy),u=fx-i,v=fy-j,w=a=>((a%n)+n)%n;const a=hash(w(i),w(j),s),b=hash(w(i+1),w(j),s),c=hash(w(i),w(j+1),s),d=hash(w(i+1),w(j+1),s);const su=u*u*(3-2*u),sv=v*v*(3-2*v);return a+(b-a)*su+(c-a)*sv+(a-b-c+d)*su*sv;};
  const fbm=(px,py,s)=>vn(px,py,128,s)*0.4+vn(px,py,64,s+1)*0.25+vn(px,py,32,s+2)*0.17+vn(px,py,16,s+3)*0.1+vn(px,py,8,s+4)*0.05+vn(px,py,4,s+5)*0.03;
  const tiles=[],wrap=v=>((v%T)+T)%T;
  const put=(id,fn)=>{seed=id*977+13;const buf=new Float32Array(T*T);for(let py=0;py<T;py++)for(let px=0;px<T;px++)buf[py*T+px]=fn(px,py);tiles[id]=buf;};
  const add=(id,px,py,v,mode)=>{const b=tiles[id],o=wrap(Math.round(py))*T+wrap(Math.round(px));b[o]=mode==='set'?v:mode==='min'?Math.min(b[o],v):mode==='max'?Math.max(b[o],v):b[o]+v;};
  const cracks=(id,n,dk,len)=>{for(let k=0;k<n;k++){let px=rr()*T,py=rr()*T,a=rr()*6.28;for(let s=0;s<(len||90);s++){a+=(rr()-0.5)*0.7;px+=Math.cos(a);py+=Math.sin(a);add(id,px,py,-dk);add(id,px+1,py,-dk*0.4);if(rr()<0.03){let qx=px,qy=py,b=a+(rr()<0.5?1:-1)*1.2;for(let t=0;t<20;t++){b+=(rr()-0.5)*0.8;qx+=Math.cos(b);qy+=Math.sin(b);add(id,qx,qy,-dk*0.7);}}}}};
  const strokes=(id,n,lmin,lmax,ang,va,vb)=>{for(let k=0;k<n;k++){const px=rr()*T,py=rr()*T,l=lmin+rr()*(lmax-lmin),a=ang+(rr()-0.5)*0.9,v=va+rr()*(vb-va);for(let t=0;t<l;t++)add(id,px+Math.cos(a)*t,py+Math.sin(a)*t,v,'max');}};
  const pebbles=(id,n,rmin,rmax,lo,hi)=>{for(let k=0;k<n;k++){const cx=rr()*T,cy=rr()*T,r=rmin+rr()*(rmax-rmin),v=lo+rr()*(hi-lo);for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const d=(dx*dx+dy*dy)/(r*r);if(d>1)continue;const sh=(-dx-dy)/(r*2)*0.12;add(id,cx+dx,cy+dy,v+sh-d*0.05,'set');}}};
  // 0 concrete panel: formwork, tie holes, pores, rain streaks, panel joints
  put(0,(px,py)=>{let v=0.56+(fbm(px,py,1)-0.5)*0.24;if(hash(px,py,9)<0.05)v-=0.08+hash(px,py,8)*0.08;const fy=py%43;if(fy<1)v-=0.05;else if(fy<2)v+=0.025;
    const tx=(px%128)-64,ty=(py%86)-43;if(tx*tx+ty*ty<10)v-=0.22;else if(tx*tx+ty*ty<16)v+=0.04;v-=(vn(px,0,16,3)>0.62?0.12*(py/T):0)+(vn(px,0,8,4)>0.7?0.06:0);
    if(px<3||py<3)v-=0.2;else if(px<5||py<5)v+=0.05;return v;});cracks(0,4,0.1,110);
  put(1,(px,py)=>0.66+(fbm(px,py,5)-0.5)*0.18+(hash(px,py,7)<0.03?-0.08:0)+(vn(px,py,4,6)-0.5)*0.04);cracks(1,3,0.07,140);
  put(2,(px,py)=>{let v=0.46+(fbm(px,py,9)-0.5)*0.24;const cx=Math.floor(px/7),cy=Math.floor(py/7),h=hash(cx,cy,21);if(h<0.45){const ox=px%7-3.5,oy=py%7-3.5,r=1.5+h*4;if(ox*ox+oy*oy<r)v+=(hash(cx,cy,22)-0.5)*0.22;}return v+(hash(px,py,3)-0.5)*0.06;});
  put(3,(px,py)=>{const f=fbm(px,py,11);let v=0.38+(f-0.5)*0.25;const p=fbm(px,py,12);if(p>0.56){v=0.30+(p-0.56)*0.6+(vn(px,py,8,13)-0.5)*0.03;}return v;});
  put(4,(px,py)=>{const f=fbm(px,py,21);let v=0.64+Math.sin(py*0.35+vn(px,py,32,24)*9)*0.012+(vn(px,py,4,25)-0.5)*0.03;if(f>0.63)v=0.47+(hash(px,py,2)-0.5)*0.06;else if(f>0.605)v=0.40;return v-(fbm(px,py,22)-0.5)*0.08;});
  put(5,(px,py)=>{let v=0.69+(vn(px,py,4,30)-0.5)*0.03-(fbm(px,py,32)-0.5)*0.1;const f=fbm(px,py,31);if(f>0.66)v=0.52;else if(f>0.64)v=0.42;const c=Math.abs(vn(px,py,32,33)-0.5);if(c<0.012)v-=0.12;return v;});cracks(5,4,0.12,120);
  put(6,(px,py)=>{let v=0.46+(fbm(px,py,41)-0.5)*0.55+(hash(px,py,6)-0.5)*0.12;if(hash(Math.floor(px/3),Math.floor(py/3),44)<0.04)v-=0.2;if(vn(px,py,16,42)>0.68)v+=0.12;return v;});
  put(7,(px,py)=>{let v=0.55+0.13*Math.sin(px*2*Math.PI/21.333)+(fbm(px,py,51)-0.5)*0.12;if(hash(px,0,52)<0.02&&hash(px,py>>4,53)<0.6)v+=0.06;if(fbm(px,py,54)>0.7)v-=0.2;return v;});
  const BR=T/12;put(8,(px,py)=>{const row=Math.floor(py/BR),off=(row%2)*32,bx=Math.floor((px+off)/64),ly=py-row*BR,lx=(px+off)%64;
    if(ly<3||lx<3)return 0.70+(hash(px,py,81)-0.5)*0.08-(ly<1||lx<1?0.12:0);let v=0.44+(hash(bx,row,8)-0.5)*0.16+(hash(px,py,82)-0.5)*0.07+(fbm(px,py,83)-0.5)*0.1;
    if(ly<5)v+=0.05;if(ly>BR-3)v-=0.07;if(hash(bx,row,84)<0.15&&lx<10&&ly<9)v=0.62;return v;});
  put(9,(px,py)=>{let v=0.40+(hash(px,py,91)-0.5)*0.2+(fbm(px,py,92)-0.5)*0.1;if(hash(Math.floor(px/2),Math.floor(py/2),93)<0.08)v+=0.15;if(Math.abs(vn(px,py,64,94)-0.5)<0.01)v-=0.2;
    const lx=px-150,ly=py-60;if(lx>0&&lx<80&&ly>0&&ly<55)v=0.30+(hash(px,py,95)-0.5)*0.08;return v;});
  put(10,(px,py)=>{const pl=Math.floor(px/32),lx=px%32;if(lx<1)return 0.18;let v=0.5+(hash(pl,0,10)-0.5)*0.16+0.07*Math.sin(py*0.18+vn(px,py,32,101+pl)*7+lx*0.25)+(hash(px,py,102)-0.5)*0.04;
    const kx=lx-16,ky=(py+pl*53)%160-80;if(kx*kx+ky*ky*0.3<18&&hash(pl,1,103)<0.6)v-=0.2;return v;});
  put(11,(px,py)=>{let v=0.24+((px+py)%96<14?0.14:0)+(fbm(px,py,112)-0.5)*0.08+Math.max(0,(py-180)/76)*0.12*fbm(px,py,113);return v;});cracks(11,2,-0.3,90);
  put(12,(px,py)=>{const f=fbm(px,py,121);let v=0.62+(hash(px,py,122)-0.5)*0.04;if(f>0.66)v=0.38+(hash(px,py,123)-0.5)*0.1;else if(f>0.645)v=0.72;return v;});strokes(12,40,8,40,0.3,0.70,0.76);
  put(13,(px,py)=>0.28+(fbm(px,py,131)-0.5)*0.14);
  put(14,(px,py)=>{const cx=Math.floor(px/32),cy=Math.floor(py/32),lx=px%32,ly=py%32;if(lx<3||ly<3)return 0.32+(py%32<3?0:0.02)-(fbm(px,py,141)>0.6?0.08:0);
    const t=hash(cx,cy,14);let v=0.74+(t-0.5)*0.1+(31-lx-ly)*0.0018;if(lx===3||ly===3)v+=0.05;if(t<0.05&&lx<12&&ly<12)v=0.40;if(Math.abs(vn(px,py,16,142)-0.5)<0.008)v-=0.08;return v;});
  put(15,(px,py)=>0.5+0.08*Math.sin(px*0.2+vn(px,py,32,151)*6)+0.05*Math.sin(py*0.25));
  put(16,(px,py)=>0.36+(fbm(px,py,162)-0.5)*0.2);strokes(16,5200,5,16,-Math.PI/2,0.48,0.82);
  put(17,(px,py)=>0.48+(fbm(px,py,171)-0.5)*0.26);pebbles(17,520,1,5,0.45,0.72);
  put(18,(px,py)=>{const lx=px%128,ly=py%128;if(lx<4||ly<4)return 0.30+(fbm(px,py,183)>0.5?0.06:0);return 0.57+(fbm(px,py,181)-0.5)*0.16-(fbm(px,py,182)>0.66?0.1:0)+(hash(px,py,184)<0.03?-0.08:0);});
  put(19,(px,py)=>0.5+0.08*Math.sin(py*0.09+fbm(px,py,192)*7)+(fbm(px,py,191)-0.5)*0.35);cracks(19,6,0.18,80);
  put(20,(px,py)=>0.30+(fbm(px,py,202)-0.5)*0.16);strokes(20,3600,4,11,0,0.40,0.62);pebbles(20,160,2,4,0.35,0.55);
  put(21,(px,py)=>{const lx=px%128,ly=py%128;let v=(lx<2||ly<2?0.44:0.6)+(fbm(px,py,211)-0.5)*0.18;if(hash(px,py,212)<0.02)v-=0.15;if(hash(px,py,213)<0.012)v+=0.14;if(fbm(px,py,214)>0.68)v-=0.06;return v;});cracks(21,4,0.12,100);
  put(22,(px,py)=>{const sx=px%32,sy=py%48,stripe=Math.floor(px/32)%2;let v=stripe?0.62:0.56;const dm=Math.abs(sx-16)+Math.abs(sy-24);if(dm<10&&dm>6)v+=0.07;if(dm<3)v+=0.05;if((sx===0||sx===31))v-=0.03;
    v-=(fbm(px,py,221)-0.5)*0.14;if(fbm(px,py,222)>0.7)v-=0.08;if(px%128<2&&fbm(px,py,223)>0.45)v=0.72;return v;});
  put(23,(px,py)=>{const col=Math.floor(px/32),lx=px%32,dir=col%2?1:-1,u=py+dir*(lx-16)*0.5+col*7,b=Math.floor(u/16),lu=((u%16)+16)%16;if(lx<1||lu<1)return 0.2;
    return 0.5+(hash(col,b,231)-0.5)*0.18+0.04*Math.sin(lx*0.9+vn(px,py,16,232+b%5)*6)+(hash(px,py,233)-0.5)*0.03;});
  put(25,(px,py)=>{const sx=px%128,sy=py%128;let v=0.56+(fbm(px,py,251)-0.5)*0.1+(hash(px,py,252)<0.12?(hash(px,py,253)-0.5)*0.16:0);if(sx<1||sy<1)v-=0.14;if(fbm(px,py,254)>0.66)v-=0.07;return v;});cracks(25,2,0.08,60);
  put(24,(px,py)=>{const w=Math.sin(px*Math.PI/2)*Math.sin(py*Math.PI/2);return 0.55+w*0.06+(fbm(px,py,241)-0.5)*0.12+(hash(px,py,242)<0.01?0.08:0);});
  // coloured grime: rust drips + dirt
  const TR={};for(const id of [0,1,2,4,5,14,18,21,7,12,22,8]){const tr=new Float32Array(T*T*3).fill(1);TR[id]=tr;seed=id*31+7;const nd=id===14?22:id===22?10:14;
    for(let k=0;k<nd;k++){const x0=Math.floor(rr()*T),y0=Math.floor(rr()*T),len=24+rr()*120,w=1+Math.floor(rr()*3),st=0.4+rr()*0.5;
      for(let y=0;y<len;y++)for(let dx=0;dx<w;dx++){const kk=st*(1-y/len),o=(((y0+y)%T)*T+((x0+dx)%T))*3;tr[o]*=1-0.16*kk;tr[o+1]*=1-0.32*kk;tr[o+2]*=1-0.46*kk;}}
    for(let py=0;py<T;py++)for(let px=0;px<T;px++){const f=fbm(px,py,id*13+5);if(f>0.6){const k=Math.min(1,(f-0.6)*4)*0.2,o=(py*T+px)*3;tr[o]*=1-k*0.8;tr[o+1]*=1-k*0.85;tr[o+2]*=1-k;}}}
  for(let id=0;id<32;id++){const buf=tiles[id],tr=TR[id],ox=(id%8)*T,oy=Math.floor(id/8)*T;for(let py=0;py<T;py++)for(let px=0;px<T;px++){const v=buf?Math.max(0,Math.min(1,buf[py*T+px]))*255:140,o=((oy+py)*W+ox+px)*4,q=(py*T+px)*3;
    D[o]=tr?v*tr[q]:v;D[o+1]=tr?v*tr[q+1]:v;D[o+2]=tr?v*tr[q+2]:v;D[o+3]=255;}}
  return D;
}

