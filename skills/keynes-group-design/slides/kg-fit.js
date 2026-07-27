/* kg-fit.js — scales a single .kg-slide (A4 가로 1280×905) to fit the viewport,
   letterboxed on the report background. Used by standalone template files. */
(function(){
  function fit(){
    var slide=document.querySelector('.kg-slide');
    if(!slide)return;
    var s=Math.min(window.innerWidth/1280, window.innerHeight/905);
    slide.style.transform='scale('+s+')';
  }
  window.addEventListener('resize',fit);
  if(document.readyState!=='loading')fit();
  else document.addEventListener('DOMContentLoaded',fit);
  setTimeout(fit,60);
})();