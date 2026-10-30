# Patch 12: (1) grabbing something the other hand holds passes it over (it used to be held by both, the
# hold fought itself and the safety release dropped it); (2) a hand on a held object keeps its own size
# unless Settings > VR > "Hands on held objects" is "Scale with object".
P = 'assets/index-B2A-NN9Y.js'
s = open(P).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, (a[:60], s.count(a)); s = s.replace(a, b)
rep("grabProp(e,t){this.physics.grab(t,12);",
    "grabProp(e,t){for(let n of this.hands)n!==e&&n.held&&n.held.prop===t&&(n.held=null,n.velHistory.length=0);this.physics.grab(t,12);")
rep("if(o){let e=o.prop.desc.object;e.updateMatrixWorld(),s=new E().multiplyMatrices(e.matrixWorld,o.offset.clone().invert()),",
    "if(o){let e=o.prop.desc.object;e.updateMatrixWorld();let hm=e.matrixWorld;if(globalThis.__studioUI?.value?.(`heldHandSize`)!==`grow`){let p=new O,q=new be;hm.decompose(p,q,new O),hm=new E().compose(p,q,new O(1,1,1))}s=new E().multiplyMatrices(hm,o.offset.clone().invert()),")
open(P, 'w').write(s)
print('patched')
