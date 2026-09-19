import { z } from 'zod';
import speakeasy from 'speakeasy';
import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { hashPassword, verifyPassword, createSession, requireAdmin, revokeSession, verifyCsrf } from '../auth.js';
import { encrypt, decrypt } from '../crypto.js';

export default async function adminRoutes(app){
 app.post('/api/admin/auth/login',async(request,reply)=>{verifyCsrf(request);const b=z.object({email:z.string().trim().toLowerCase().email(),password:z.string().min(1),mfaCode:z.string().regex(/^\d{6}$/).optional()}).parse(request.body);const r=await query('SELECT * FROM admin_users WHERE email=$1',[b.email]);const a=r.rows[0],valid=a?await verifyPassword(a.password_hash,b.password).catch(()=>false):false;if(!valid||a.status!=='active')return reply.code(401).send({error:'Email or password is incorrect.'});if(!a.mfa_enabled)return reply.code(403).send({error:'Admin MFA is not enabled for this account.'});if(!b.mfaCode)return reply.code(401).send({error:'MFA code required.',code:'MFA_REQUIRED'});const secret=decrypt(a.mfa_secret_encrypted);if(!speakeasy.totp.verify({secret,encoding:'base32',token:b.mfaCode,window:1}))return reply.code(401).send({error:'Invalid MFA code.',code:'MFA_INVALID'});await query('UPDATE admin_users SET last_login_at=NOW(3),updated_at=NOW(3) WHERE id=$1',[a.id]);await createSession({adminUserId:a.id,request,reply});await query(`INSERT INTO audit_logs(id,admin_user_id,action,entity_type,entity_id,ip_address,user_agent,metadata) VALUES($1,$2,'ADMIN_LOGIN','admin_user',$2,$3,$4,JSON_OBJECT())`,[randomUUID(),a.id,request.ip,request.headers['user-agent']||null]);return {admin:{id:a.id,email:a.email,firstName:a.first_name,lastName:a.last_name,role:a.role}};});
 app.post('/api/admin/auth/logout',async(request,reply)=>{verifyCsrf(request);await revokeSession(request,reply);return {ok:true};});
 app.get('/api/admin/me',async(request,reply)=>{const s=await requireAdmin(request,reply);if(!s)return;return {admin:{id:s.admin_user_id,email:s.admin_email,firstName:s.admin_first_name,lastName:s.admin_last_name,role:s.admin_role}};});
 app.get('/api/admin/orders',async(request,reply)=>{const s=await requireAdmin(request,reply,['super_admin','admin','support','fulfilment']);if(!s)return;return {orders:(await query(`SELECT o.id,o.order_number,o.status,o.payment_status,o.total,o.currency,o.created_at,u.email,u.first_name,u.last_name FROM orders o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 200`)).rows};});
 app.get('/api/admin/customers',async(request,reply)=>{const s=await requireAdmin(request,reply,['super_admin','admin','support']);if(!s)return;return {customers:(await query(`SELECT id,email,first_name,last_name,phone,email_verified_at,status,marketing_opt_in,created_at,last_login_at FROM users ORDER BY created_at DESC LIMIT 500`)).rows};});
 app.get('/api/admin/products',async(request,reply)=>{const s=await requireAdmin(request,reply,['super_admin','admin']);if(!s)return;const r=await query(`SELECT p.id,p.slug,p.name,p.brand,p.description,p.collection,p.family,p.image_url,p.is_active,p.is_featured,p.is_best_seller,p.stock_packets,p.low_stock_threshold,p.stock_updated_at,p.created_at,p.updated_at,COALESCE(JSON_ARRAYAGG(CASE WHEN v.id IS NULL THEN NULL ELSE JSON_OBJECT('id',v.id,'name',v.name,'sku',v.sku,'price',v.price,'currency',v.currency,'quantityDescription',v.quantity_description,'unitsPerSale',v.units_per_sale) END),JSON_ARRAY()) variants FROM products p LEFT JOIN product_variants v ON v.product_id=p.id GROUP BY p.id ORDER BY p.collection,p.name`);return {products:r.rows.map(x=>({...x,variants:(Array.isArray(x.variants)?x.variants:JSON.parse(x.variants||'[]')).filter(Boolean)}))};});
 app.patch('/api/admin/orders/:id',async(request,reply)=>{const s=await requireAdmin(request,reply,['super_admin','admin','fulfilment']);if(!s)return;verifyCsrf(request);const b=z.object({status:z.enum(['pending_payment','paid','processing','shipped','delivered','cancelled','refunded'])}).parse(request.body);const old=await query('SELECT status FROM orders WHERE id=$1',[request.params.id]);if(!old.rows[0])return reply.code(404).send({error:'Order not found'});await query('UPDATE orders SET status=$1,updated_at=NOW(3) WHERE id=$2',[b.status,request.params.id]);await query(`INSERT INTO audit_logs(id,admin_user_id,action,entity_type,entity_id,ip_address,user_agent,metadata) VALUES($1,$2,'ORDER_STATUS_CHANGED','order',$3,$4,$5,$6)`,[randomUUID(),s.admin_user_id,request.params.id,request.ip,request.headers['user-agent']||null,JSON.stringify({from:old.rows[0].status,to:b.status})]);return {order:(await query('SELECT * FROM orders WHERE id=$1',[request.params.id])).rows[0]};});
 app.patch('/api/admin/products/:id/variant/:variantId',async(request,reply)=>{const s=await requireAdmin(request,reply,['super_admin','admin']);if(!s)return;verifyCsrf(request);const b=z.object({price:z.number().min(0).max(100000),isActive:z.boolean().optional()}).parse(request.body);const old=await query('SELECT price FROM product_variants WHERE id=$1 AND product_id=$2',[request.params.variantId,request.params.id]);if(!old.rows[0])return reply.code(404).send({error:'Variant not found'});await query('UPDATE product_variants SET price=$1,is_active=COALESCE($2,is_active),updated_at=NOW(3) WHERE id=$3',[b.price,b.isActive==null?null:(b.isActive?1:0),request.params.variantId]);await query(`INSERT INTO audit_logs(id,admin_user_id,action,entity_type,entity_id,ip_address,user_agent,metadata) VALUES($1,$2,'PRODUCT_PRICE_CHANGED','product_variant',$3,$4,$5,$6)`,[randomUUID(),s.admin_user_id,request.params.variantId,request.ip,request.headers['user-agent']||null,JSON.stringify({from:Number(old.rows[0].price),to:b.price})]);return {variant:(await query('SELECT * FROM product_variants WHERE id=$1',[request.params.variantId])).rows[0]};});
 app.get('/api/admin/audit-logs',async(request,reply)=>{const s=await requireAdmin(request,reply,['super_admin','admin']);if(!s)return;return {logs:(await query(`SELECT al.*,a.email admin_email FROM audit_logs al LEFT JOIN admin_users a ON a.id=al.admin_user_id ORDER BY al.created_at DESC LIMIT 500`)).rows};});
 app.post('/api/admin/mfa/setup',async(request,reply)=>{const s=await requireAdmin(request,reply,['super_admin','admin']);if(!s)return;verifyCsrf(request);const secret=speakeasy.generateSecret({name:`Mistic Aura (${s.admin_email})`,length:20});await query('UPDATE admin_users SET mfa_secret_encrypted=$1,updated_at=NOW(3) WHERE id=$2',[encrypt(secret.base32),s.admin_user_id]);return {secret:secret.base32,otpauthUrl:secret.otpauth_url};});
 app.post('/api/admin/mfa/enable',async(request,reply)=>{const s=await requireAdmin(request,reply,['super_admin','admin']);if(!s)return;verifyCsrf(request);const b=z.object({code:z.string().regex(/^\d{6}$/)}).parse(request.body);const r=await query('SELECT mfa_secret_encrypted FROM admin_users WHERE id=$1',[s.admin_user_id]);if(!r.rows[0]?.mfa_secret_encrypted)return reply.code(400).send({error:'Start MFA setup first.'});if(!speakeasy.totp.verify({secret:decrypt(r.rows[0].mfa_secret_encrypted),encoding:'base32',token:b.code,window:1}))return reply.code(400).send({error:'Invalid MFA code.'});await query('UPDATE admin_users SET mfa_enabled=1,updated_at=NOW(3) WHERE id=$1',[s.admin_user_id]);await query(`INSERT INTO audit_logs(id,admin_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'MFA_ENABLED','admin_user',$2,JSON_OBJECT())`,[randomUUID(),s.admin_user_id]);return {ok:true};});

 /* ------------------------------------------------------------------ STOCK
  * Stock is ONE manual number per product, counted in packets (the smallest
  * sellable unit). Each variant consumes units_per_sale packets per unit sold,
  * so a single entry here governs every variant of that product.
  * ------------------------------------------------------------------ */

 app.get('/api/admin/stock', async (request, reply) => {
   const s = await requireAdmin(request, reply, ['super_admin', 'admin', 'fulfilment']);
   if (!s) return;

   const r = await query(
     `SELECT p.id, p.slug, p.name, p.collection, p.image_url, p.is_active,
             p.stock_packets, p.low_stock_threshold, p.stock_updated_at,
             COALESCE(MAX(CASE WHEN v.name='Box' THEN v.units_per_sale END), 12) AS packets_per_box
        FROM products p
        LEFT JOIN product_variants v ON v.product_id = p.id
       GROUP BY p.id
       ORDER BY p.collection, p.name`
   );

   const products = r.rows.map(row => {
     const packets = Number(row.stock_packets);
     const perBox = Number(row.packets_per_box) || 12;
     return {
       ...row,
       stock_packets: packets,
       packets_per_box: perBox,
       full_boxes: Math.floor(packets / perBox),
       loose_packets: packets % perBox,
       is_low: packets > 0 && packets <= Number(row.low_stock_threshold),
       is_out: packets <= 0
     };
   });

   return {
     products,
     summary: {
       total: products.length,
       outOfStock: products.filter(p => p.is_out).length,
       lowStock: products.filter(p => p.is_low).length
     }
   };
 });

 app.patch('/api/admin/products/:id/stock', async (request, reply) => {
   const s = await requireAdmin(request, reply, ['super_admin', 'admin', 'fulfilment']);
   if (!s) return;
   verifyCsrf(request);

   const b = z.object({
     stockPackets: z.number().int().min(0).max(1000000).optional(),
     adjustBy: z.number().int().min(-1000000).max(1000000).optional(),
     lowStockThreshold: z.number().int().min(0).max(100000).optional(),
     note: z.string().trim().max(255).optional()
   }).refine(
     v => v.stockPackets !== undefined || v.adjustBy !== undefined || v.lowStockThreshold !== undefined,
     { message: 'Provide stockPackets, adjustBy or lowStockThreshold.' }
   ).parse(request.body);

   const result = await withTransaction(async c => {
     const locked = await c.query('SELECT id,name,stock_packets FROM products WHERE id=$1 FOR UPDATE', [request.params.id]);
     const product = locked.rows[0];
     if (!product) throw Object.assign(new Error('Product not found'), { statusCode: 404 });

     const before = Number(product.stock_packets);
     let after = before;
     let reason = 'correction';

     if (b.stockPackets !== undefined) {
       after = b.stockPackets;
       reason = 'manual_set';
     } else if (b.adjustBy !== undefined) {
       after = before + b.adjustBy;
       reason = 'manual_adjust';
       if (after < 0) throw Object.assign(new Error('That adjustment would take stock below zero.'), { statusCode: 400 });
     }

     if (b.lowStockThreshold !== undefined) {
       await c.query('UPDATE products SET low_stock_threshold=$1,updated_at=NOW(3) WHERE id=$2', [b.lowStockThreshold, product.id]);
     }

     if (after !== before) {
       await c.query(
         'UPDATE products SET stock_packets=$1,stock_updated_at=NOW(3),updated_at=NOW(3) WHERE id=$2',
         [after, product.id]
       );
       await c.query(
         `INSERT INTO stock_movements(id,product_id,change_packets,balance_after,reason,admin_user_id,note)
          VALUES($1,$2,$3,$4,$5,$6,$7)`,
         [randomUUID(), product.id, after - before, after, reason, s.admin_user_id, b.note || null]
       );
       await c.query(
         `INSERT INTO audit_logs(id,admin_user_id,action,entity_type,entity_id,ip_address,user_agent,metadata)
          VALUES($1,$2,'STOCK_CHANGED','product',$3,$4,$5,$6)`,
         [randomUUID(), s.admin_user_id, product.id, request.ip, request.headers['user-agent'] || null,
          JSON.stringify({ from: before, to: after, reason, note: b.note || null })]
       );
     }

     return (await c.query(
       'SELECT id,name,stock_packets,low_stock_threshold,stock_updated_at FROM products WHERE id=$1',
       [product.id]
     )).rows[0];
   });

   return { product: result };
 });

 app.get('/api/admin/stock/movements', async (request, reply) => {
   const s = await requireAdmin(request, reply, ['super_admin', 'admin', 'fulfilment']);
   if (!s) return;

   const params = [];
   let where = '';
   if (request.query.productId) {
     params.push(request.query.productId);
     where = ' WHERE m.product_id=$1';
   }

   return {
     movements: (await query(
       `SELECT m.id,m.change_packets,m.balance_after,m.reason,m.note,m.created_at,
               p.name AS product_name, a.email AS admin_email, o.order_number
          FROM stock_movements m
          JOIN products p ON p.id = m.product_id
          LEFT JOIN admin_users a ON a.id = m.admin_user_id
          LEFT JOIN orders o ON o.id = m.order_id
          ${where}
         ORDER BY m.created_at DESC
         LIMIT 200`,
       params
     )).rows
   };
 });
}