document.addEventListener('DOMContentLoaded',async()=>{
  const form=document.querySelector('#account-form');
  if(!form)return;
  const msg=document.querySelector('#account-message');
  const say=(text,error=false)=>{msg.textContent=text;msg.className=`form-message show${error?' error':''}`;};
  let account;
  try{account=await API.request('/api/account');}catch(err){if(err.status===401){location.href='login.html?return=account.html';return;}say(err.message,true);return;}
  const u=account.user;
  form.elements.firstName.value=u.first_name||'';form.elements.lastName.value=u.last_name||'';form.elements.phone.value=u.phone||'';
  document.querySelector('#account-email').textContent=u.email; document.querySelector('#account-email-readonly').value=u.email;
  document.querySelector('#account-status').textContent=u.email_verified_at?'Email verified':'Email not verified';
  form.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(form);try{await API.request('/api/account',{method:'PATCH',body:JSON.stringify({firstName:f.get('firstName'),lastName:f.get('lastName'),phone:f.get('phone')||null})});say('Your details have been updated.');}catch(err){say(err.message,true);}});
  document.querySelector('#account-logout')?.addEventListener('click',async()=>{try{await API.request('/api/auth/logout',{method:'POST'});}finally{location.href='index.html';}});
  const orders=document.querySelector('#account-orders');orders.innerHTML=account.orders.length?account.orders.map(o=>`<article class="account-order"><div><small>${o.order_number}</small><h3>${new Date(o.created_at).toLocaleDateString('en-AU')}</h3></div><div><span>${o.status}</span><strong>AUD ${Number(o.total).toFixed(2)}</strong></div></article>`).join(''):'<p>No orders yet. Explore the collections to find your first ritual.</p>';
  const addressForm=document.querySelector('#address-form');const addresses=document.querySelector('#addresses');
  const renderAddresses=()=>{addresses.innerHTML=(account.addresses||[]).map(a=>`<article class="account-address"><strong>${a.label}</strong><p>${a.first_name} ${a.last_name}<br>${a.address_line_1}${a.address_line_2?'<br>'+a.address_line_2:''}<br>${a.suburb}, ${a.state} ${a.postcode}<br>Australia</p></article>`).join('')||'<p>No saved addresses yet.</p>';};renderAddresses();
  addressForm?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(addressForm);try{const d=await API.request('/api/account/addresses',{method:'POST',body:JSON.stringify({label:f.get('label')||'Home',firstName:f.get('firstName'),lastName:f.get('lastName'),addressLine1:f.get('addressLine1'),addressLine2:f.get('addressLine2')||null,suburb:f.get('suburb'),state:f.get('state'),postcode:f.get('postcode'),country:'AU',isDefaultShipping:true,isDefaultBilling:true})});account.addresses=[d.address,...(account.addresses||[])];renderAddresses();addressForm.reset();say('Address saved.');}catch(err){say(err.message,true);}});
});
