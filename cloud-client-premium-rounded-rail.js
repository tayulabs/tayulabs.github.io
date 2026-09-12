(() => {
  const id='tayuPremiumRoundedRailFix';
  if(document.getElementById(id))return;
  const style=document.createElement('style');
  style.id=id;
  style.textContent=`@media (min-width:961px){.sidebar{border-radius:30px!important;box-shadow:0 16px 38px rgba(0,0,0,.14)!important}.main{margin-left:244px!important}body.sidebar-collapsed .main{margin-left:100px!important}.sidebar-collapse-btn{z-index:70!important}}`;
  document.head.appendChild(style);
})();
