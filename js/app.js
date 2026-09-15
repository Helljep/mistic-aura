
/* =========================================================
   MISTIC AURA — vanilla JavaScript
   Shared state, navigation overlays, cart, filters and forms.
   No framework and no Tailwind dependency.
   ========================================================= */

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const money = n => `AUD ${Number(n).toFixed(2)}`;
const productById = id => PRODUCTS.find(p => p.id === id);
const asset = p => `assets/${p.image}`;

const store = {
  get cart(){ return JSON.parse(localStorage.getItem('misticAuraCart') || '[]'); },
  set cart(v){ localStorage.setItem('misticAuraCart', JSON.stringify(v)); },
  get recent(){ return JSON.parse(localStorage.getItem('misticAuraRecent') || '[]'); },
  set recent(v){ localStorage.setItem('misticAuraRecent', JSON.stringify(v)); }
};

function showNotice(message){
  $('#notice-text').textContent = message;
  $('#notice-modal').classList.add('open');
}
function openUI(name){ $(`#${name}-drawer, #${name}-modal`.replace(', #','')).classList.add('open'); }
function closeUI(name){
  const el = document.getElementById(`${name}-drawer`) || document.getElementById(`${name}-modal`);
  if(el) el.classList.remove('open');
}
function cartCount(){ return store.cart.reduce((n,l)=>n+l.quantity,0); }
function updateCount(){
  const n=cartCount();
  ['bag-count','drawer-count'].forEach(id=>{const el=$('#'+id); if(el) el.textContent=n;});
}

function addToCart(id, quantity=1, variant='packet'){
  const cart=[...store.cart];
  const found=cart.find(x=>x.id===id && (x.variant||'packet')===variant);
  if(found) found.quantity=Math.min(99,found.quantity+quantity);
  else cart.push({id,quantity,variant});
  store.cart=cart;
  updateCount(); renderBag();
  const label=variant==='box'?'Box · 12 packets · 96 sticks':'Packet · 8 sticks';
  showNotice(`Added ${label} to your bag. Your next quiet moment starts here.`);
}
function changeCart(id, quantity, variant='packet'){
  store.cart=store.cart.map(x=>x.id===id && (x.variant||'packet')===variant?{...x,quantity}:x).filter(x=>x.quantity>0);
  updateCount(); renderBag();
}
function bagMarkup(){
  const cart=store.cart;
  if(!cart.length) return `<div class="empty"><h2>A little space for calm.</h2><p>Your bag is waiting for its first fragrance.</p><a class="button" href="products.html">Find your ritual <span>→</span></a></div>`;
  return `<div class="shipping-progress"><p>Complimentary Australia-wide shipping on orders over $75</p><div class="track"><span style="width:0%"></span></div><small>Boxes are AUD 30.00 each. Complimentary shipping applies over A$75.</small></div>`+
    cart.map(line=>{
      const p=productById(line.id); if(!p) return '';
      return `<div class="bag-line"><a href="product.html?id=${p.id}"><img src="${asset(p)}" alt="${p.name}"></a><div><small>${p.collection}</small><a href="product.html?id=${p.id}"><h3>${p.name}</h3></a><span>${(line.variant||'packet')==='box'?'Box · 12 packets · 96 sticks':'Packet · 8 sticks'} · ${money((line.variant||'packet')==='box'?30:4)} each</span><div class="quantity"><button data-change="${p.id}" data-variant="${line.variant||'packet'}" data-quantity="${line.quantity-1}">−</button><span>${line.quantity}</span><button data-change="${p.id}" data-variant="${line.variant||'packet'}" data-quantity="${line.quantity+1}" ${line.quantity>=99?'disabled':''}>+</button></div></div><button class="remove" data-change="${p.id}" data-variant="${line.variant||'packet'}" data-quantity="0">Remove</button></div>`;
    }).join('')+
    `<div class="totals"><span>Subtotal</span><strong>${money(cart.reduce((sum,line)=>sum+line.quantity*((line.variant||'packet')==='box'?30:4),0))}</strong></div><a class="button full" href="checkout.html">Continue to checkout <span>→</span></a><a class="text-link centered" href="cart.html">View shopping bag</a>`;
}
function renderBag(){
  const drawer=$('#drawer-bag'); if(drawer) drawer.innerHTML=bagMarkup();
  const page=$('#cart-page'); if(page) page.innerHTML=bagMarkup();
  const summary=$('#checkout-summary'); if(summary) summary.innerHTML=bagMarkup();
}
function renderCards(list, root){
  if(!root) return;
  root.innerHTML=list.length?list.map(p=>cardHTML(p)).join(''):'<p class="no-results">No fragrances found in this family.</p>';
}
function cardHTML(p){
  return `
    <article
      class="product-card tone-${p.family.toLowerCase()}"
      data-product-url="product.html?id=${p.id}"
      tabindex="0"
      role="link"
      aria-label="Explore ${p.name}"
    >
      <a class="product-art" href="product.html?id=${p.id}">
        <span class="art-label">
          ${p.collection.toUpperCase()} / ${p.family.toUpperCase()}
        </span>

        <img
          src="${asset(p)}"
          alt="${p.name}"
          loading="lazy"
        >

        ${p.best ? '<span class="badge">Most loved</span>' : ''}
      </a>

      <div class="product-line">
        <div>
          <small>${p.collection}</small>

          <a href="product.html?id=${p.id}">
            <h3>${p.name}</h3>
          </a>
        </div>

        <button
          class="round"
          data-add="${p.id}"
          aria-label="Add ${p.name} to bag"
        >
          +
        </button>
      </div>

      <p>${p.description}</p>

      <div class="product-footer">
        <span class="price">AUD 30.00 per box</span>

        <a
          class="explore-product"
          href="product.html?id=${p.id}"
          aria-label="Explore ${p.name}"
        >
          Explore product <span>→</span>
        </a>
      </div>
    </article>
  `;
}

function setupOverlays(){
  $$('[data-open]').forEach(b=>b.addEventListener('click',()=> {
    const name=b.dataset.open;
    const el=document.getElementById(`${name}-drawer`)||document.getElementById(`${name}-modal`);
    if(el) el.classList.add('open');
  }));
  $$('[data-close]').forEach(b=>b.addEventListener('click',()=>closeUI(b.dataset.close)));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape') ['cart','mobile','search','notice','zoom'].forEach(closeUI);
  });
}
function setupNav(){
  const path=location.pathname;
  $$('[data-nav]').forEach(a=>{
    const n=a.dataset.nav;
    if((n==='home' && (path.endsWith('/')||path.endsWith('/index.html'))) ||
       (n==='products' && path.endsWith('products.html')) ||
       (n==='story' && path.endsWith('story.html')) ||
       (n==='ritual' && location.hash==='#ritual')) a.classList.add('active');
  });
}
function setupAdds(){
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-add]');
    if(b){ e.preventDefault(); e.stopPropagation(); addToCart(b.dataset.add); return; }
    const c=e.target.closest('[data-change]');
    if(c) changeCart(c.dataset.change,Math.max(0,Math.min(99,+c.dataset.quantity)),c.dataset.variant||'packet');
  });
}
function setupCardNavigation(){
  document.addEventListener('click',e=>{
    const card=e.target.closest('.product-card[data-product-url]');
    if(!card || e.target.closest('a,button,input,select')) return;
    location.href=card.dataset.productUrl;
  });
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter' && e.key!==' ') return;
    const card=e.target.closest('.product-card[data-product-url]');
    if(!card || e.target!==card) return;
    e.preventDefault(); location.href=card.dataset.productUrl;
  });
}
function setupHome(){
  const root=$('#discovery-products');
  if(root){
    const draw=f=>{
      $$('#families button').forEach(b=>b.classList.toggle('selected',b.dataset.family===f));
      renderCards(PRODUCTS.filter(p=>f==='All'||p.family===f).slice(0,4),root);
    };
    $$('#families button').forEach(b=>b.addEventListener('click',()=>draw(b.dataset.family)));
    draw('All');
  }
  let slide=0;
  const heroImg=$('.hero-image');
  const setSlide=n=>{
    slide=n; $$('.slide-controls button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.slide==n));
    const content=$('#hero-content');
    if(content){ content.style.animation='none'; void content.offsetWidth; content.style.animation='reveal 1s both'; }
  };
  $$('.slide-controls button').forEach(b=>b.addEventListener('click',()=>setSlide(+b.dataset.slide)));
  if(heroImg) setInterval(()=>setSlide((slide+1)%3),6500);
}
function setupProducts(){
  const sections=$$('.product-grid[data-collection]');
  if(!sections.length) return;
  let family='All';
  const draw=()=>sections.forEach(root=>renderCards(PRODUCTS.filter(p=>p.collection===root.dataset.collection && (family==='All'||p.family===family)),root));
  $$('[data-family]').forEach(b=>b.addEventListener('click',()=>{family=b.dataset.family;draw();}));
  draw();
}
function setupProduct(){
  const id=new URLSearchParams(location.search).get('id');
  const p=productById(id)||PRODUCTS[0];
  if(!$('#product-name')) return;
  store.recent=[p.id,...store.recent.filter(x=>x!==p.id)].slice(0,6);
  $('#product-breadcrumb').textContent=`${p.collection} / ${p.name}`;
  $('#product-meta').textContent=`${p.collection} / ${p.family}`;
  $('#product-name').textContent=p.name;
  $('#product-description').textContent=p.description;
  $('#acc-fragrance').textContent=p.description;
  $('#product-family').textContent=`${p.family} fragrance`;
  const packSelect=$('#pack-size');
  const priceEl=$('#product-price');
  const selectedPrice=()=>packSelect?.value==='box'?30:4;
  const updateProductPrice=()=>{ if(priceEl) priceEl.textContent=money(selectedPrice()); };
  if(packSelect){ packSelect.addEventListener('change',updateProductPrice); updateProductPrice(); }
  $('#story-name').textContent=p.name.toUpperCase();
  $('#story-description').textContent=`${p.description} Explore this fragrance as part of the ${p.collection} collection.`;
  if(p.family==='Floral') $('#story-heading').textContent='A softer kind of presence.';
  const main=$('#product-image'); main.src=asset(p); main.alt=p.name+' illustrative atmosphere';
  const thumbs=$('#thumbnails');
  [asset(p),'assets/hero.png'].forEach((src,i)=>{const b=document.createElement('button');b.setAttribute('aria-pressed',i===0);b.innerHTML=`<img src="${src}" alt="Incense atmosphere">`;b.addEventListener('click',()=>{main.src=src;$$('#thumbnails button').forEach(x=>x.setAttribute('aria-pressed','false'));b.setAttribute('aria-pressed','true')});thumbs.appendChild(b);});
  let qty=1; const qtyEl=$('#qty');
  $('#qty-minus').onclick=()=>{qty=Math.max(1,qty-1);qtyEl.textContent=qty};
  $('#qty-plus').onclick=()=>{qty=Math.min(99,qty+1);qtyEl.textContent=qty};
  $('#add-product').onclick=()=>addToCart(p.id,qty,packSelect?.value||'packet');
  $('#buy-now').onclick=()=>{addToCart(p.id,qty,packSelect?.value||'packet');setTimeout(()=>location.href='checkout.html',0)};
  $('#detail-image').onclick=()=>{$('#zoom-title').textContent=p.name+' · atmosphere';$('#zoom-image').src=main.src;$('#zoom-image').alt=p.name;$('#zoom-modal').classList.add('open')};
  const related=PRODUCTS.filter(x=>x.id!==p.id&&x.family===p.family).slice(0,4);
  const more=PRODUCTS.filter(x=>x.id!==p.id&&x.collection===p.collection).slice(0,4);
  $('#related').innerHTML=rowStatic('You may also love.',related)+rowStatic('More from '+p.collection+'.',more);
}
function rowStatic(title,list){
 return `<section class="section"><div class="section-heading"><div><small>FIND YOUR RITUAL</small><h2>${title}</h2></div><a class="text-link" href="products.html">Explore all fragrances <span>↗</span></a></div><div class="product-row">${list.map(cardHTML).join('')}</div></section>`;
}
function setupForms(){
  const news=$('#newsletter-form');
  if(news) news.addEventListener('submit',e=>{e.preventDefault();localStorage.setItem('misticAuraNewsletter',new FormData(news).get('email'));news.reset();showNotice('Thank you. You’re on the list.')});
  const checkout=$('#checkout-form');
  if(checkout) checkout.addEventListener('submit',e=>{e.preventDefault();showNotice('Checkout is not available yet. No order has been placed.')});
  const profile=$('#profile-form');
  if(profile){
    const saved=JSON.parse(localStorage.getItem('misticAuraProfile')||'{}');
    Object.keys(saved).forEach(k=>{if(profile.elements[k]) profile.elements[k].value=saved[k]});
    profile.addEventListener('submit',e=>{e.preventDefault();const o=Object.fromEntries(new FormData(profile));localStorage.setItem('misticAuraProfile',JSON.stringify(o));showNotice('Your details have been saved.')});
  }
}
function setupSearch(){
  const input=$('#search-input'), results=$('#search-results');
  if(!input||!results) return;
  const draw=()=>{
    const q=input.value.toLowerCase().trim();
    const list=PRODUCTS.filter(p=>(p.name+' '+p.collection+' '+p.description+' '+p.family).toLowerCase().includes(q));
    results.innerHTML=list.length?list.map(p=>`<a href="product.html?id=${p.id}"><img src="${asset(p)}" alt=""><div><small>${p.collection}</small><h3>${p.name}</h3><span>AUD 30.00 per box</span></div><span>↗</span></a>`).join(''):'<p>No fragrances found. Try a collection or scent family.</p>';
  };
  input.addEventListener('input',draw); draw();
}

function init(){
  updateCount(); renderBag(); setupOverlays(); setupNav(); setupAdds();
setupCardNavigation(); setupHome(); setupProducts(); setupProduct(); setupForms(); setupSearch();
  const y=$('#year'); if(y) y.textContent=new Date().getFullYear();
  $('#whatsapp')?.addEventListener('click',()=>showNotice('Message support will be available when our business contact is added.'));
  const observer=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('revealed');observer.unobserve(e.target)}}),{threshold:.12});
  $$('.section-heading,.story-copy,.quality article').forEach(n=>{n.classList.add('scroll-reveal');observer.observe(n)});
}
document.addEventListener('DOMContentLoaded',init);
