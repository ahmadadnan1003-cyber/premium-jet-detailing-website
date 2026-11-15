
(()=>{
  const touch=matchMedia('(pointer:coarse)').matches;
  const dialog=document.getElementById('model-dialog');
  const open=document.getElementById('expand-hangar');
  if(touch){
    open.textContent='Open 3D';
    const hint=document.createElement('span');hint.className='mobile-3d-hint';
    hint.textContent='Tap Open 3D to rotate and zoom';
    document.getElementById('hangar-stage').append(hint);
    dialog.querySelector(':scope > p').firstChild.textContent='Drag to rotate · pinch to zoom · ';
  }
  open.addEventListener('click',()=>{if(dialog.open)document.body.classList.add('has-model-dialog');});
  dialog.addEventListener('close',()=>document.body.classList.remove('has-model-dialog'));
  window.addEventListener('orientationchange',()=>setTimeout(()=>window.PJDModels?.getEngine()?.resize(),180));
  window.visualViewport?.addEventListener('resize',()=>{if(dialog.open)window.PJDModels?.getEngine()?.resize();});
})();
