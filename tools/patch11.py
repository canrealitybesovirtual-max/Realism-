# Patch 11: spawns go to the terrace pad (globalThis.__spawnPad, set by addons/props.js), and the middle
# pane of the west glazing is an open doorway (no glass, no collider below the transom).
import sys
P = 'assets/index-B2A-NN9Y.js'
s = open(P).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, (a[:60], s.count(a)); s = s.replace(a, b)
rep("inFront(){let e=this.player();return new O(e.x,.6,e.z).add(this.playerForward().multiplyScalar(1.2))}",
    "inFront(){let e=globalThis.__spawnPad&&globalThis.__spawnPad();return e||this.nearPlayer()}nearPlayer(){let e=this.player();return new O(e.x,.6,e.z).add(this.playerForward().multiplyScalar(1.2))}")
rep("_(s-.05,a/2,(Ot.zMin+Ot.zMax)/2,.05,a/2,(Ot.zMax-Ot.zMin)/2)",
    "(()=>{let F=Ot.frame,M=(Ot.zMax-Ot.zMin-F*2-Ot.mullions*F)/(Ot.mullions+1),z0=Ot.zMin+2*F+M,z1=z0+M,ht=Ot.transom-F*.4;_(s-.05,a/2,(Ot.zMin+z0)/2,.05,a/2,(z0-Ot.zMin)/2),_(s-.05,a/2,(z1+Ot.zMax)/2,.05,a/2,(Ot.zMax-z1)/2),_(s-.05,(ht+a)/2,(z0+z1)/2,.05,(a-ht)/2,(z1-z0)/2)})()")
rep("let g=new Fe(d-2*s,f-2*s);g.rotateY(Math.PI/2);let _=new T(g,e.glass);return _.position.set(n,(a+o)/2,(r+i)/2),_.name=`window-glass`,_.renderOrder=10,t.add(_),t}",
    "let G=(z0,z1,y0,y1)=>{let g=new Fe(z1-z0,y1-y0);return g.rotateY(Math.PI/2),g.translate(n,(y0+y1)/2,(z0+z1)/2),g},Z0=r+2*s+m,Z1=Z0+m,_=new T(Bt([G(r+s,Z0,a+s,o-s),G(Z1,i-s,a+s,o-s),G(Z0,Z1,l+s*.4,o-s)]),e.glass);return _.name=`window-glass`,_.renderOrder=10,t.add(_),t}")
open(P, 'w').write(s)
print('patched')
