(() => {
  const id = 'hendy-studio-bookmarklet';
  document.getElementById(id)?.remove();
  const panel = document.createElement('div'); panel.id = id;
  Object.assign(panel.style, { position:'fixed', right:'16px', bottom:'16px', zIndex:'2147483647', padding:'12px 15px', borderRadius:'10px', background:'#191923', color:'#fff', border:'1px solid #8c78ff', boxShadow:'0 10px 30px #0006', font:'13px system-ui' });
  panel.textContent = 'Hendy Studio · URL ready: ' + location.href;
  document.body.append(panel); setTimeout(() => panel.remove(), 6000);
})();
