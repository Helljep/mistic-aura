const adminMsg=(text,error=false)=>{const el=document.querySelector('#admin-message');if(!el)return;el.textContent=text;el.className=`form-message show${error?' error':''}`;};
async function adminAPI(url,options={}){return API.request(url,options);}

document.addEventListener('DOMContentLoaded',async()=>{
  const login=document.querySelector('#admin-login-form');
  if(login) login.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(login);try{await adminAPI('/api/admin/auth/login',{method:'POST',body:JSON.stringify({email:f.get('email'),password:f.get('password'),mfaCode:f.get('mfaCode')||undefined})});location.href='admin.html';}catch(err){adminMsg(err.message,true);}});

  const dashboard=document.querySelector('#admin-dashboard');
  if(!dashboard)return;
  try{
    const me=await adminAPI('/api/admin/me');
    document.querySelector('#admin-name').textContent=me.admin.firstName; document.querySelector('#admin-name-copy').textContent=me.admin.firstName;
    document.querySelector('#admin-role').textContent=me.admin.role.replace('_',' ');
    const [orders,customers,products,logs]=await Promise.all([adminAPI('/api/admin/orders'),adminAPI('/api/admin/customers'),adminAPI('/api/admin/products'),adminAPI('/api/admin/audit-logs')]);
    document.querySelector('#admin-orders').textContent=orders.orders.length;
    document.querySelector('#admin-customers').textContent=customers.customers.length;
    document.querySelector('#admin-products').textContent=products.products.length;
    document.querySelector('#admin-logs').textContent=logs.logs.length;
    document.querySelector('#orders-table').innerHTML=orders.orders.slice(0,20).map(o=>`<tr><td>${o.order_number}</td><td>${o.email||'Guest'}</td><td>AUD ${Number(o.total).toFixed(2)}</td><td>${o.status}</td></tr>`).join('')||'<tr><td colspan="4">No orders yet.</td></tr>';
    document.querySelector('#customers-table').innerHTML=customers.customers.slice(0,20).map(c=>`<tr><td>${c.first_name} ${c.last_name}</td><td>${c.email}</td><td>${c.email_verified_at?'Verified':'Pending'}</td></tr>`).join('')||'<tr><td colspan="3">No customers yet.</td></tr>';
  }catch(err){location.href='admin-login.html';return;}
  document.querySelector('#admin-logout')?.addEventListener('click',async()=>{try{await adminAPI('/api/admin/auth/logout',{method:'POST'});}finally{location.href='admin-login.html';}});
});
