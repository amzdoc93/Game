/* Realistic WebGL lens that assembles on scroll. Uses global THREE (UMD build). */
(function(){
  var canvas = document.getElementById('lensCanvas');
  var cinema = document.getElementById('cinema');
  if(!canvas || !cinema || !window.THREE){ return; }

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function easeOut(t){ return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t){ return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }
  function stage(p,s,e){ return easeOut(clamp((p-s)/(e-s),0,1)); }

  function knurlBump(){
    var c=document.createElement('canvas'); c.width=512; c.height=64;
    var g=c.getContext('2d');
    g.fillStyle='#808080'; g.fillRect(0,0,512,64);
    for(var x=0;x<512;x+=8){
      var v=Math.round(128+90*Math.sin(x/8*Math.PI));
      g.fillStyle='rgb('+v+','+v+','+v+')'; g.fillRect(x,0,4,64);
    }
    var t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(70,1);
    return t;
  }

  // studio environment for PBR reflections (replaces RoomEnvironment, works offline)
  function studioEnv(renderer){
    var s=new THREE.Scene(); s.background=new THREE.Color(0x1b1d22);
    function panel(col,x,y,z,sx,sy,inten){
      var m=new THREE.Mesh(new THREE.PlaneGeometry(sx,sy),
        new THREE.MeshBasicMaterial({color:new THREE.Color(col).multiplyScalar(inten)}));
      m.position.set(x,y,z); m.lookAt(0,0,0); s.add(m);
    }
    panel(0xffffff, 0, 7, 3, 10, 5, 2.6);    // top key
    panel(0xffe9d2,-7, 2, 4, 6, 10, 2.4);    // warm left
    panel(0xbcd4ff, 7, 1,-4, 6, 10, 1.9);    // cool right
    panel(0xff7a34, 0,-5,-5, 10, 5, 1.3);    // ember rim
    panel(0x0c0d11, 0, 0, 8, 16, 16, 1.0);   // dark front (contrast)
    var pmrem=new THREE.PMREMGenerator(renderer);
    return pmrem.fromScene(s,0.04).texture;
  }

  var renderer;
  try{
    renderer=new THREE.WebGLRenderer({canvas:canvas, antialias:true, alpha:true});
  }catch(e){ return; }   // no WebGL → leave canvas empty, page still works
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.0;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(34,1,0.1,100);
  camera.position.set(0,0,7.4);
  scene.environment=studioEnv(renderer);

  var key=new THREE.DirectionalLight(0xffffff,2.4); key.position.set(3.5,4.5,5);
  var rim=new THREE.DirectionalLight(0xff7a34,2.0); rim.position.set(-5,-1.5,-3.5);
  var fill=new THREE.DirectionalLight(0x9fc4ff,0.7); fill.position.set(-3.5,3,2.5);
  scene.add(key,rim,fill);

  var bump=knurlBump();
  var matBarrel=new THREE.MeshPhysicalMaterial({color:0x0c0d11,metalness:0.4,roughness:0.52,clearcoat:0.5,clearcoatRoughness:0.35,envMapIntensity:0.75});
  var matGrip  =new THREE.MeshPhysicalMaterial({color:0x121419,metalness:0.4,roughness:0.66,bumpMap:bump,bumpScale:0.012,envMapIntensity:0.8});
  var matRed   =new THREE.MeshPhysicalMaterial({color:0xcf1414,metalness:0.1,roughness:0.16,clearcoat:1,clearcoatRoughness:0.05});
  var matSilver=new THREE.MeshPhysicalMaterial({color:0xc9ccd3,metalness:1,roughness:0.28});
  var matGold  =new THREE.MeshStandardMaterial({color:0xd9a441,metalness:1,roughness:0.35});
  var matWhite =new THREE.MeshStandardMaterial({color:0xe9edf5,metalness:0.2,roughness:0.5});
  var matGlass =new THREE.MeshPhysicalMaterial({color:0xffffff,metalness:0,roughness:0.03,transmission:1,ior:1.52,
    thickness:1.6,transparent:true,clearcoat:1,clearcoatRoughness:0.04,iridescence:0.7,iridescenceIOR:1.3,
    iridescenceThicknessRange:[120,420],attenuationColor:new THREE.Color(0x9fbfff),attenuationDistance:4,envMapIntensity:1.5});

  function lathe(pts,seg){ seg=seg||96;
    var v=pts.map(function(p){return new THREE.Vector2(p[0],p[1]);});
    return new THREE.LatheGeometry(v,seg);
  }
  function V(r,y){ return [r,y]; }

  var model=new THREE.Group();
  var parts=[];
  function addPart(mesh,opts){ var g=new THREE.Group(); g.add(mesh); g.userData=opts; parts.push(g); model.add(g); return g; }

  // 1) rear bayonet mount
  var mount=addPart(new THREE.Mesh(lathe([V(0.62,-1.95),V(1.02,-1.95),V(1.02,-1.72),V(1.16,-1.72),V(1.16,-1.6),V(0.95,-1.6),V(0.95,-1.55),V(0.62,-1.55)]),matSilver),
    {dist:-1.9,s:0.02,e:0.16,roll:0.6});
  for(var i=0;i<3;i++){ var tab=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.06,0.12),matSilver);
    var a=i/3*Math.PI*2; tab.position.set(Math.cos(a)*1.12,-1.66,Math.sin(a)*1.12); tab.lookAt(0,-1.66,0); mount.add(tab); }
  for(var j=0;j<8;j++){ var ct=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.16,0.05),matGold);
    var b=-0.6+j*0.17; ct.position.set(Math.cos(b)*0.82,-1.9,Math.sin(b)*0.82); ct.lookAt(0,-1.9,0); mount.add(ct); }

  // 2) rear barrel
  addPart(new THREE.Mesh(lathe([V(0.95,-1.55),V(1.12,-1.5),V(1.14,-1.0),V(1.12,-0.55),V(1.1,-0.5)]),matBarrel),
    {dist:-1.25,s:0.1,e:0.26,roll:0});
  // 3) knurled focus ring
  addPart(new THREE.Mesh(lathe([V(1.12,-0.5),V(1.2,-0.46),V(1.2,0.12),V(1.12,0.16)]),matGrip),
    {dist:-0.7,s:0.2,e:0.4,roll:1.6});
  // 4) front barrel
  addPart(new THREE.Mesh(lathe([V(1.12,0.16),V(1.14,0.2),V(1.14,0.72),V(1.0,0.86),V(0.99,0.9)]),matBarrel),
    {dist:0.7,s:0.3,e:0.5,roll:0});
  // 5) red brand ring (+ index dot)
  var redRing=addPart(new THREE.Mesh(lathe([V(0.99,0.9),V(1.06,0.94),V(1.06,1.02),V(0.99,1.04)]),matRed),
    {dist:1.05,s:0.38,e:0.56,roll:-1.2});
  var dot=new THREE.Mesh(new THREE.SphereGeometry(0.045,16,16),matWhite); dot.position.set(0,0.98,1.06); redRing.add(dot);
  // 6) front filter ring lip
  addPart(new THREE.Mesh(lathe([V(0.82,1.04),V(0.99,1.04),V(0.99,1.18),V(0.8,1.18)]),matBarrel),
    {dist:1.4,s:0.44,e:0.62,roll:0});
  // 7) front glass element (biconvex)
  addPart(new THREE.Mesh(lathe([V(0,1.46),V(0.3,1.4),V(0.55,1.3),V(0.78,1.16),V(0.84,1.06),V(0.8,0.96),V(0.55,0.86),V(0.3,0.8),V(0,0.78)],120),matGlass),
    {dist:1.9,s:0.5,e:0.72,roll:0});
  // 8) inner element
  addPart(new THREE.Mesh(lathe([V(0,0.7),V(0.25,0.66),V(0.5,0.54),V(0.6,0.42),V(0.5,0.32),V(0.25,0.26),V(0,0.24)],96),matGlass.clone()),
    {dist:1.4,s:0.46,e:0.66,roll:0});

  var pivot=new THREE.Group(); pivot.add(model); scene.add(pivot);
  model.rotation.x=Math.PI/2;     // optical axis -> toward camera
  pivot.rotation.x=-0.32;
  pivot.rotation.y=-0.45;

  function update(p){
    var assembleDone=clamp(p/0.74,0,1);
    var pe=easeInOut(clamp((p-0.74)/0.26,0,1));      // teardown at the end
    for(var k=0;k<parts.length;k++){
      var g=parts[k], o=g.userData;
      var f=stage(p,o.s,o.e);
      g.position.y=(1-f)*o.dist + pe*o.dist*1.5;     // slide in, then spread out
      g.rotation.y=(1-f)*(o.roll||0) + pe*(o.roll||0)*0.6;
      var m=g.children[0].material;
      if(m && 'opacity' in m){ m.opacity=clamp(f*1.6,0,1); m.transparent=true; }
    }
    pivot.scale.setScalar(0.92+Math.pow(p,1.3)*0.16);
    pivot.rotation.y=-0.45+easeOut(assembleDone)*0.25+pe*0.9;
    pivot.rotation.x=-0.32-pe*0.12;
  }

  function resize(){
    var w=canvas.clientWidth||canvas.parentElement.clientWidth;
    var h=canvas.clientHeight||canvas.parentElement.clientHeight;
    if(!w||!h) return;
    renderer.setSize(w,h,false);
    camera.aspect=w/h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas.parentElement); resize();

  function progress(){ var r=cinema.getBoundingClientRect(); var total=cinema.offsetHeight-window.innerHeight; return clamp(-r.top/total,0,1); }
  var cur=0, idle=0;
  function tick(){
    requestAnimationFrame(tick);
    var r=cinema.getBoundingClientRect();
    var visible=r.bottom>-50 && r.top<window.innerHeight+50;
    cur+=(progress()-cur)*0.12;
    idle+=0.0016;
    update(cur);
    pivot.rotation.y+=Math.sin(idle)*0.0006;
    if(visible){ resize(); renderer.render(scene,camera); }
  }
  tick();
})();
