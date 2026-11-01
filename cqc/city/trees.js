export function treeAtlasCanvas(){const W=64,Hh=128,c=document.createElement('canvas');c.width=W*4;c.height=Hh;const x=c.getContext('2d');let s=11;const r=()=>(s=(s*16807)%2147483647)/2147483647;
  // pine
  x.fillStyle='#3b2a1c';x.fillRect(W/2-3,Hh-30,6,30);
  for(let i=0;i<7;i++){const y=Hh-22-i*14,w=(7-i)*7+6;x.fillStyle=['#1f3a24','#25432a','#1b331f'][i%3];x.beginPath();x.moveTo(W/2,y-26);x.lineTo(W/2+w/2,y);x.lineTo(W/2-w/2,y);x.closePath();x.fill();}
  // birch
  x.fillStyle='#d8d6cc';x.fillRect(W+W/2-3,30,6,Hh-30);x.fillStyle='#222';for(let i=0;i<10;i++)x.fillRect(W+W/2-3,40+i*8,3+r()*3,2);
  for(let i=0;i<70;i++){x.fillStyle=['#5f7a3a','#6f8a44','#4f6a33','#7c9650'][i%4];const a=r()*Math.PI*2,d=r()*24;x.beginPath();x.arc(W+W/2+Math.cos(a)*d,40+Math.sin(a)*d*1.3,5+r()*4,0,7);x.fill();}
  // bush
  x.fillStyle='#3b2a1c';x.fillRect(2*W+W/2-2,Hh-24,4,24);
  for(let i=0;i<80;i++){x.fillStyle=['#3e5a2c','#4a6834','#35502a','#56763b'][i%4];const a=r()*Math.PI*2,d=r()*24;x.beginPath();x.arc(2*W+W/2+Math.cos(a)*d,Hh-58+Math.sin(a)*d*1.1,6+r()*5,0,7);x.fill();}
  // dead bare tree
  {const br=(x0,y0,a,len,w,d)=>{if(d>6||len<3)return;const x1=x0+Math.cos(a)*len,y1=y0-Math.sin(a)*len;x.strokeStyle=d<2?'#2e2822':'#3a332c';x.lineWidth=w;x.lineCap='round';x.beginPath();x.moveTo(x0,y0);x.lineTo(x1,y1);x.stroke();
     const n=d<1?3:2;for(let i=0;i<n;i++)br(x1,y1,a+(r()-0.5)*1.3+(i-(n-1)/2)*0.5,len*(0.62+r()*0.15),Math.max(1,w*0.62),d+1);};
   x.save();x.beginPath();x.rect(3*W,0,W,Hh);x.clip();br(3*W+W/2,Hh,Math.PI/2+(r()-0.5)*0.1,34,5,0);x.restore();}
  return c;}
