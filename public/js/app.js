/* =========================================================
   MISTIC AURA — vanilla JavaScript
   Shared state, navigation overlays, cart, filters and forms.
   No framework and no Tailwind dependency.

   Product data now comes from GET /api/products (live stock,
   live pricing). js/data.js is kept only as an offline fallback
   if the API cannot be reached — the storefront never goes blank.
   ========================================================= */

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const money = n => `AUD ${Number(n).toFixed(2)}`;
const asset = p => `assets/${p.image}`;

/* ----------------------------------------------------- CATALOG LOADING */
// Every card/detail/search function below reads from CATALOG, never
// from PRODUCTS directly, so the rest of the file is agnostic to
// whether the data came from the API or the static fallback.
let CATALOG = [];

function mapApiProduct(row){
  const variants = {};
  (row.variants || []).forEach(v => {
    const key = String(v.name || '').toLowerCase();
    if(!key) return;
    variants[key] = {
      id: v.id,
      price: Number(v.price),
      unitsPerSale: Number(v.unitsPerSale || 1),
      maxQuantity: Number.isFinite(Number(v.maxQuantity)) ? Number(v.maxQuantity) : 0,
      inStock: v.inStock !== false,
      quantityDescription: v.quantityDescription || ''
    };
  });
  return {
    id: row.slug,
    productId: row.id,
    name: row.name,
    collection: row.collection,
    family: row.family,
    description: row.description,
    image: row.image_url,
    best: !!row.is_best_seller,
    inStock: row.inStock !== false,
    lowStock: !!row.lowStock,
    stockPackets: Number.isFinite(Number(row.stockPackets)) ? Number(row.stockPackets) : null,
    variants
  };
}

function mapFallbackProduct(p){
  // Used only if the API is unreachable. Treated as always in stock so a
  // network hiccup never blocks someone from browsing or buying.
  return {
    id: p.id,
    productId: null,
    name: p.name,
    collection: p.collection,
    family: p.family,
    description: p.description,
    image: p.image,
    best: !!p.best,
    inStock: true,
    lowStock: false,
    stockPackets: null,
    variants: {
      box: { id: null, price: 30, unitsPerSale: 12, maxQuantity: 99, inStock: true, quantityDescription: '12 packets · 96 sticks' },
      packet: { id: null, price: 4, unitsPerSale: 1, maxQuantity: 99, inStock: true, quantityDescription: '8 sticks' }
    }
  };
}

async function loadCatalog(){
  try{
    const data = await API.request('/api/products');
    const list = Array.isArray(data.products) ? data.products : [];
    if(!list.length) throw new Error('No products returned');
    return list.map(mapApiProduct);
  }catch(err){
    console.warn('Mistic Aura: could not reach live product data, showing offline catalogue.', err);
    return (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).map(mapFallbackProduct);
  }
}

const productById = id => CATALOG.find(p => p.id === id);
const variantOf = (p, key) => p?.variants?.[key];
const unitPrice = (p, key) => {
  const v = variantOf(p, key);
  return v && Number.isFinite(v.price) ? v.price : (key === 'box' ? 30 : 4);
};

/* ----------------------------------------------------------------- CART */
// "Recently viewed" is purely cosmetic, so it stays in localStorage.
// The cart itself now lives on the server — see CART below.
const store = {
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

/* ----------------------------------------------------------------- CART
 * The cart lives on the server (GET/POST/PATCH/DELETE /api/cart...).
 * A guest gets a cookie-based cart automatically; a signed-in user's cart
 * is tied to their account. CART below is just the last response from the
 * server — it is never written to directly, only replaced wholesale by
 * whatever the API returns, so the UI can never drift from the real total.
 * ------------------------------------------------------------------- */
let CART = { items: [], subtotal: 0, currency: 'AUD' };

async function loadCart(){
  try{
    return await API.request('/api/cart');
  }catch(err){
    console.warn('Mistic Aura: could not load your bag.', err);
    return { items: [], subtotal: 0, currency: 'AUD' };
  }
}

// Finds a catalog variant by its live variant_id, so the cart page can
// know the current stock ceiling for a line that's already in the bag.
function catalogVariantByVariantId(variantId){
  for(const p of CATALOG){
    for(const key of Object.keys(p.variants || {})){
      if(p.variants[key].id === variantId) return { product: p, key, variant: p.variants[key] };
    }
  }
  return null;
}

function cartCount(){ return (CART.items || []).reduce((n,l)=>n+l.quantity,0); }
function updateCount(){
  const n=cartCount();
  ['bag-count','drawer-count'].forEach(id=>{const el=$('#'+id); if(el) el.textContent=n;});
}

async function addToCart(id, quantity=1, variant='packet'){
  const product = productById(id);
  const variantData = variantOf(product, variant);

  if(!product || !variantData || !variantData.id){
    showNotice('This item is unavailable right now. Please refresh the page and try again.');
    return;
  }
  if(variantData.inStock === false){
    showNotice(`${product.name} — ${variant==='box'?'Box':'Packet'} is currently sold out.`);
    return;
  }

  const existingLine = (CART.items || []).find(x => x.variant_id === variantData.id);
  const currentQty = existingLine ? existingLine.quantity : 0;
  let addQty = quantity;

  if(Number.isFinite(variantData.maxQuantity)){
    const allowed = variantData.maxQuantity - currentQty;
    if(allowed <= 0){ showNotice(`${product.name} is out of stock right now.`); return; }
    if(addQty > allowed) addQty = allowed;
  }

  try{
    const data = await API.request('/api/cart/items', {
      method: 'POST',
      body: JSON.stringify({ variantId: variantData.id, quantity: addQty })
    });
    CART = data;
    updateCount(); renderBag();

    const label = variant==='box' ? 'Box · 12 packets · 96 sticks' : 'Packet · 8 sticks';
    showNotice(addQty < quantity
      ? `Only ${addQty} more available — added what we have in stock.`
      : `Added ${label} to your bag. Your next quiet moment starts here.`);
  }catch(err){
    showNotice(err.message || 'Could not add this to your bag. Please try again.');
  }
}

async function changeCart(cartItemId, quantity){
  try{
    const data = quantity <= 0
      ? await API.request(`/api/cart/items/${cartItemId}`, { method: 'DELETE' })
      : await API.request(`/api/cart/items/${cartItemId}`, { method: 'PATCH', body: JSON.stringify({ quantity }) });
    CART = data;
    updateCount(); renderBag();
  }catch(err){
    showNotice(err.message || 'Could not update your bag. Please try again.');
  }
}

function bagMarkup(){
  const items = CART.items || [];
  if(!items.length) return `<div class="empty"><h2>A little space for calm.</h2><p>Your bag is waiting for its first fragrance.</p><a class="button" href="products.html">Find your ritual <span>→</span></a></div>`;

  return `<div class="shipping-progress"><p>Complimentary Australia-wide shipping on orders over $75</p><div class="track"><span style="width:0%"></span></div><small>Boxes are AUD 30.00 each. Complimentary shipping applies over A$75.</small></div>`+
    items.map(line=>{
      const match = catalogVariantByVariantId(line.variant_id);
      const maxQ = match && Number.isFinite(match.variant.maxQuantity) ? match.variant.maxQuantity : 99;
      const atMax = line.quantity >= maxQ;
      const variantLabel = line.variant_name === 'Box' ? 'Box · 12 packets · 96 sticks' : 'Packet · 8 sticks';
      return `<div class="bag-line"><a href="product.html?id=${line.slug}"><img src="assets/${line.image_url}" alt="${line.name}"></a><div><small>${line.collection}</small><a href="product.html?id=${line.slug}"><h3>${line.name}</h3></a><span>${variantLabel} · ${money(Number(line.price))} each</span><div class="quantity"><button data-change="${line.id}" data-quantity="${line.quantity-1}">−</button><span>${line.quantity}</span><button data-change="${line.id}" data-quantity="${line.quantity+1}" ${atMax?'disabled':''}>+</button></div></div><button class="remove" data-change="${line.id}" data-quantity="0">Remove</button></div>`;
    }).join('')+
    `<div class="totals"><span>Subtotal</span><strong>${money(Number(CART.subtotal || 0))}</strong></div><a class="button full" href="checkout.html">Continue to checkout <span>→</span></a><a class="text-link centered" href="cart.html">View shopping bag</a>`;
}
function renderBag(){
  const drawer=$('#drawer-bag'); if(drawer) drawer.innerHTML=bagMarkup();
  const page=$('#cart-page'); if(page) page.innerHTML=bagMarkup();
  const summary=$('#checkout-summary'); if(summary) summary.innerHTML=bagMarkup();
}

/* --------------------------------------------------------------- CARDS */
function renderCards(list, root){
  if(!root) return;
  root.innerHTML=list.length?list.map(p=>cardHTML(p)).join(''):'<p class="no-results">No fragrances found in this family.</p>';
}
function cardHTML(p){
  const soldOut = p.inStock === false;
  const boxPrice = unitPrice(p, 'box');
  const badge = soldOut
    ? '<span class="badge out">Sold out</span>'
    : p.best
      ? '<span class="badge">Most loved</span>'
      : p.lowStock
        ? '<span class="badge low">Only a few left</span>'
        : '';

  return `
    <article
      class="product-card tone-${p.family.toLowerCase()}${soldOut ? ' is-sold-out' : ''}"
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

        ${badge}
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
          ${soldOut ? 'disabled' : ''}
        >
          +
        </button>
      </div>

      <p>${p.description}</p>

      <div class="product-footer">
        <span class="price">${soldOut ? 'Currently unavailable' : money(boxPrice)+' per box'}</span>

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

/* ---------------------------------------------------------- CHROME/NAV */
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
    if(b){ e.preventDefault(); e.stopPropagation(); if(!b.disabled) addToCart(b.dataset.add); return; }
    const c=e.target.closest('[data-change]');
    if(c) changeCart(c.dataset.change,Math.max(0,Math.min(99,+c.dataset.quantity)));
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
      renderCards(CATALOG.filter(p=>f==='All'||p.family===f).slice(0,4),root);
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
  const draw=()=>sections.forEach(root=>renderCards(CATALOG.filter(p=>p.collection===root.dataset.collection && (family==='All'||p.family===family)),root));
  $$('[data-family]').forEach(b=>b.addEventListener('click',()=>{family=b.dataset.family;draw();}));
  draw();
}

/* ------------------------------------------------------------ PRODUCT */
function setupProduct(){
  const id=new URLSearchParams(location.search).get('id');
  const p=productById(id)||CATALOG[0];
  if(!p || !$('#product-name')) return;

  store.recent=[p.id,...store.recent.filter(x=>x!==p.id)].slice(0,6);
  $('#product-breadcrumb').textContent=`${p.collection} / ${p.name}`;
  $('#product-meta').textContent=`${p.collection} / ${p.family}`;
  $('#product-name').textContent=p.name;
  $('#product-description').textContent=p.description;
  $('#acc-fragrance').textContent=p.description;
  $('#product-family').textContent=`${p.family} fragrance`;

  const packSelect=$('#pack-size');
  const priceEl=$('#product-price');
  const stockEl=$('#stock-status');
  const addBtn=$('#add-product');
  const buyBtn=$('#buy-now');

  let qty=1;
  const qtyEl=$('#qty');
  const qtyPlusEl=$('#qty-plus');
  const qtyMinusEl=$('#qty-minus');

  const currentVariant=()=>variantOf(p, packSelect?.value||'packet');

  const refreshVariantUI=()=>{
    const v=currentVariant();
    if(priceEl) priceEl.textContent=money(v && Number.isFinite(v.price) ? v.price : (packSelect?.value==='box'?30:4));

    if(packSelect){
      [...packSelect.options].forEach(opt=>{
        const ov=variantOf(p, opt.value);
        opt.disabled = ov ? ov.inStock===false : false;
      });
    }

    const soldOut = v ? v.inStock===false : false;
    if(stockEl){
      if(soldOut){ stockEl.textContent='Sold out for this pack size.'; stockEl.className='stock-status out'; }
      else if(p.lowStock){ stockEl.textContent='Only a few left — order soon.'; stockEl.className='stock-status low'; }
      else { stockEl.textContent='In stock.'; stockEl.className='stock-status ok'; }
    }

    if(addBtn) addBtn.disabled=soldOut;
    if(buyBtn) buyBtn.disabled=soldOut;

    const maxQ = v && Number.isFinite(v.maxQuantity) ? v.maxQuantity : 99;
    if(qty>maxQ && maxQ>0){ qty=maxQ; if(qtyEl) qtyEl.textContent=qty; }
    if(qtyPlusEl) qtyPlusEl.disabled = qty>=maxQ;
  };

  if(packSelect) packSelect.addEventListener('change',()=>{ qty=1; if(qtyEl) qtyEl.textContent=qty; refreshVariantUI(); });

  $('#story-name').textContent=p.name.toUpperCase();
  $('#story-description').textContent=`${p.description} Explore this fragrance as part of the ${p.collection} collection.`;
  if(p.family==='Floral') $('#story-heading').textContent='A softer kind of presence.';

  const main=$('#product-image'); main.src=asset(p); main.alt=p.name+' illustrative atmosphere';
  const thumbs=$('#thumbnails');
  thumbs.innerHTML='';
  [asset(p),'assets/hero.png'].forEach((src,i)=>{const b=document.createElement('button');b.setAttribute('aria-pressed',i===0);b.innerHTML=`<img src="${src}" alt="Incense atmosphere">`;b.addEventListener('click',()=>{main.src=src;$$('#thumbnails button').forEach(x=>x.setAttribute('aria-pressed','false'));b.setAttribute('aria-pressed','true')});thumbs.appendChild(b);});

  if(qtyMinusEl) qtyMinusEl.onclick=()=>{qty=Math.max(1,qty-1);qtyEl.textContent=qty; refreshVariantUI();};
  if(qtyPlusEl) qtyPlusEl.onclick=()=>{
    const v=currentVariant();
    const maxQ = v && Number.isFinite(v.maxQuantity) ? v.maxQuantity : 99;
    qty=Math.min(maxQ,qty+1); qtyEl.textContent=qty; refreshVariantUI();
  };
  if(addBtn) addBtn.onclick=()=>addToCart(p.id,qty,packSelect?.value||'packet');
  // Buy now must wait for the cart write to actually land before leaving
  // the page — navigating away can abort an in-flight request.
  if(buyBtn) buyBtn.onclick=async()=>{await addToCart(p.id,qty,packSelect?.value||'packet');location.href='checkout.html'};
  $('#detail-image').onclick=()=>{$('#zoom-title').textContent=p.name+' · atmosphere';$('#zoom-image').src=main.src;$('#zoom-image').alt=p.name;$('#zoom-modal').classList.add('open')};

  refreshVariantUI();

  const related=CATALOG.filter(x=>x.id!==p.id&&x.family===p.family).slice(0,4);
  const more=CATALOG.filter(x=>x.id!==p.id&&x.collection===p.collection).slice(0,4);
  $('#related').innerHTML=rowStatic('You may also love.',related)+rowStatic('More from '+p.collection+'.',more);
}
function rowStatic(title,list){
 return `<section class="section"><div class="section-heading"><div><small>FIND YOUR RITUAL</small><h2>${title}</h2></div><a class="text-link" href="products.html">Explore all fragrances <span>↗</span></a></div><div class="product-row">${list.map(cardHTML).join('')}</div></section>`;
}

/* ---------------------------------------------------------------- FORMS */
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
    const list=CATALOG.filter(p=>(p.name+' '+p.collection+' '+p.description+' '+p.family).toLowerCase().includes(q));
    results.innerHTML=list.length?list.map(p=>`<a href="product.html?id=${p.id}"><img src="${asset(p)}" alt=""><div><small>${p.collection}</small><h3>${p.name}</h3><span>${p.inStock===false?'Currently unavailable':money(unitPrice(p,'box'))+' per box'}</span></div><span>↗</span></a>`).join(''):'<p>No fragrances found. Try a collection or scent family.</p>';
  };
  input.addEventListener('input',draw); draw();
}

/* ------------------------------------------------------------------ INIT */
async function init(){
  [CATALOG, CART] = await Promise.all([loadCatalog(), loadCart()]);

  updateCount(); renderBag(); setupOverlays(); setupNav(); setupAdds();
  setupCardNavigation(); setupHome(); setupProducts(); setupProduct(); setupForms(); setupSearch();
  const y=$('#year'); if(y) y.textContent=new Date().getFullYear();
  $('#whatsapp')?.addEventListener('click',()=>showNotice('Message support will be available when our business contact is added.'));
  const observer=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('revealed');observer.unobserve(e.target)}}),{threshold:.12});
  $$('.section-heading,.story-copy,.quality article').forEach(n=>{n.classList.add('scroll-reveal');observer.observe(n)});
}
document.addEventListener('DOMContentLoaded',init);