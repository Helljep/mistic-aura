const authMessage=(text,error=false)=>{const el=document.querySelector('#form-message');if(!el)return;el.textContent=text;el.className=`form-message show${error?' error':''}`;};
const authRequest=(url,body)=>API.request(url,{method:'POST',body:JSON.stringify(body)});

document.addEventListener('DOMContentLoaded',async()=>{
  const signup=document.querySelector('#signup-form');
  if(signup) signup.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(signup);const password=f.get('password');const confirm=f.get('confirmPassword');if(password!==confirm)return authMessage('Passwords do not match.',true);try{await authRequest('/api/auth/register',{firstName:f.get('firstName'),lastName:f.get('lastName'),email:f.get('email'),password,marketingOptIn:f.get('marketingOptIn')==='on'});location.href=`verify-email.html?email=${encodeURIComponent(f.get('email'))}`;}catch(err){authMessage(err.message,true);}});

  const login=document.querySelector('#login-form');
  if(login) login.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(login);try{await authRequest('/api/auth/login',{email:f.get('email'),password:f.get('password')});location.href='account.html';}catch(err){authMessage(err.message,true);if(err.data?.code==='EMAIL_NOT_VERIFIED')document.querySelector('#resend-link')?.classList.remove('hidden');}});

  const forgot=document.querySelector('#forgot-form');
  if(forgot) forgot.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(forgot);try{const d=await authRequest('/api/auth/forgot-password',{email:f.get('email')});authMessage(d.message);forgot.reset();}catch(err){authMessage(err.message,true);}});

  const verify=document.querySelector('#verify-form');
  if(verify){const token=new URLSearchParams(location.search).get('token');if(token){try{const d=await authRequest('/api/auth/verify-email',{token});authMessage(d.message);verify.querySelector('[type=submit]').disabled=true;}catch(err){authMessage(err.message,true);}}verify.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(verify);try{const d=await authRequest('/api/auth/resend-verification',{email:f.get('email')});authMessage(d.message);f.reset();}catch(err){authMessage(err.message,true);}});}

  const reset=document.querySelector('#reset-form');
  if(reset) reset.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(reset);if(f.get('password')!==f.get('confirmPassword'))return authMessage('Passwords do not match.',true);try{const d=await authRequest('/api/auth/reset-password',{token:f.get('token'),password:f.get('password')});authMessage(d.message);setTimeout(()=>location.href='login.html',1000);}catch(err){authMessage(err.message,true);}});
});
