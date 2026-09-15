const API={
  async csrf(){const r=await fetch('/api/auth/csrf',{credentials:'include'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not initialize security token');return d.csrfToken;},
  async request(url,options={}){const method=(options.method||'GET').toUpperCase();const headers={...(options.headers||{})};if(options.body!==undefined&&!headers['Content-Type'])headers['Content-Type']='application/json';if(['POST','PUT','PATCH','DELETE'].includes(method))headers['X-CSRF-Token']=await API.csrf();const r=await fetch(url,{...options,method,headers,credentials:'include'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||'Request failed'),{status:r.status,data:d});return d;}
};
