import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { query } from '../db.js';
import { verifyCsrf } from '../auth.js';
export default async function newsletterRoutes(app){
  app.post('/api/newsletter/subscribe',async(request,reply)=>{verifyCsrf(request);const b=z.object({email:z.string().trim().toLowerCase().email().max(320)}).parse(request.body);const existing=await query('SELECT id FROM newsletter_subscribers WHERE email=$1',[b.email]);if(existing.rows[0]){await query("UPDATE newsletter_subscribers SET status='subscribed',subscribed_at=NOW(3),unsubscribed_at=NULL WHERE id=$1",[existing.rows[0].id]);}else{await query("INSERT INTO newsletter_subscribers(id,email,status,source) VALUES($1,$2,'subscribed','website')",[randomUUID(),b.email]);}return {message:'Thanks — you are subscribed.'};});
}
