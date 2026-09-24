import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createClient } from '@supabase/supabase-js';

const e=process.env;
for(const k of ['DISCORD_TOKEN','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','BOT_OWNER_ID']) if(!e[k]) throw new Error('Missing '+k);
const db=createClient(e.SUPABASE_URL!,e.SUPABASE_SERVICE_ROLE_KEY!);
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});
const DEFAULT_PREFIX=e.PREFIX||'UwU', START=Number(e.STARTING_BALANCE||1000), MAX_CF=Number(e.MAX_CF_BET||500000);
const fmt=(n:number)=>n>=1e9?(n/1e9).toFixed(2).replace(/\.00$/,'')+' billion':n>=1e6?(n/1e6).toFixed(2).replace(/\.00$/,'')+' million':n>=1e3?(n/1e3).toFixed(2).replace(/\.00$/,'')+'k':n.toLocaleString('en-US');
const emb=(t:string,d:string)=>new EmbedBuilder().setTitle(t).setDescription(d).setColor(0xff8ac8).setTimestamp();
async function user(id:string){let {data}=await db.from('users').select('*').eq('discord_user_id',id).maybeSingle();if(data)return data;const r=await db.from('users').insert({discord_user_id:id,balance:START}).select().single();if(r.error)throw r.error;return r.data}
async function guild(id:string){let {data}=await db.from('guild_settings').select('*').eq('guild_id',id).maybeSingle();if(data)return data;const r=await db.from('guild_settings').insert({guild_id:id,prefix:DEFAULT_PREFIX,cash_name:'UwU'}).select().single();if(r.error)throw r.error;return r.data}
async function change(id:string,delta:number,type:string,metadata:any={}){const r=await db.rpc('uwu_change_balance',{p_user:id,p_delta:Math.trunc(delta),p_type:type,p_metadata:metadata});if(r.error)throw r.error;return Number(r.data)}
async function xp(id:string,amount:number){const u=await user(id),newXp=Number(u.xp||0)+amount,level=Math.max(1,Math.floor(Math.sqrt(newXp/100))+1);await db.from('users').update({xp:newXp,level,updated_at:new Date().toISOString()}).eq('discord_user_id',id)}
async function cd(id:string,c:string,seconds:number){const now=Date.now(),r=await db.from('cooldowns').select('expires_at').eq('discord_user_id',id).eq('command',c).maybeSingle();if(r.data&&new Date(r.data.expires_at).getTime()>now)return Math.ceil((new Date(r.data.expires_at).getTime()-now)/1000);await db.from('cooldowns').upsert({discord_user_id:id,command:c,expires_at:new Date(now+seconds*1000).toISOString()});return 0}
async function giveItem(uid:string,item:string,qty=1){const r=await db.rpc('uwu_add_item',{p_user:uid,p_item:item,p_quantity:qty});if(r.error)throw r.error}
async function unlock(uid:string,id:string){const q=await db.from('user_achievements').select('achievement_id').eq('discord_user_id',uid).eq('achievement_id',id).maybeSingle();if(q.data)return false;const a=await db.from('achievements').select('*').eq('id',id).maybeSingle();if(!a.data)return false;await db.from('user_achievements').insert({discord_user_id:uid,achievement_id:id});if(a.data.reward)await change(uid,Number(a.data.reward),'achievement_reward',{achievement:id});if(a.data.xp)await xp(uid,Number(a.data.xp));return true}
async function checkAchievements(uid:string){const u=await user(uid);if(u.started)await unlock(uid,'first_start');if(Number(u.balance)>=10000)await unlock(uid,'rich_10k');if(Number(u.balance)>=1000000)await unlock(uid,'rich_1m');const inv=await db.from('inventory').select('item_id').eq('discord_user_id',uid).gt('quantity',0);if((inv.data?.length||0)>=5)await unlock(uid,'collector_5')}
async function items(uid:string,kind?:string){let q:any=db.from('inventory').select('quantity,equipped,catalog_items(id,name,emoji,rarity,sell_price,xp,kind,metadata)').eq('discord_user_id',uid).gt('quantity',0);const r=await q;if(r.error)throw r.error;return (r.data||[]).filter((x:any)=>!kind||x.catalog_items?.kind===kind)}
client.once(Events.ClientReady,c=>console.log('UWU ready: '+c.user.tag));
client.on(Events.GuildCreate,g=>guild(g.id).catch(console.error));

client.on(Events.MessageCreate,async m=>{
 if(m.author.bot||!m.guild)return;
 try{
  const s=await guild(m.guild.id),p=s.prefix;if(!m.content.toLowerCase().startsWith(p.toLowerCase()))return;
  const a=m.content.slice(p.length).trim().split(/\s+/),cmd=(a.shift()||'').toLowerCase();if(!cmd)return;
  const u=await user(m.author.id);
  if(u.disabled&&!['useron','userstatus'].includes(cmd))return void m.reply({embeds:[emb('Account Disabled','Your UWU account is disabled.')]});
  if(cmd==='start'){if(u.started)return void m.reply('Your UWU account is already active.');await db.from('users').update({started:true}).eq('discord_user_id',m.author.id);await unlock(m.author.id,'first_start');return void m.reply({embeds:[emb('UWU Account','Account activated. Starting balance: '+fmt(START)+' '+s.cash_name)]})}
  if(!u.started&&!['help','start'].includes(cmd))return void m.reply('Use '+p+' start first.');

  if(cmd==='help')return void m.reply({embeds:[emb('UWU Commands',
    p+' bal | profile | stats | daily | work | mine | hunt | fish | cf amount\n'+
    p+' bank deposit amount | bank withdraw amount\n'+p+' pay @user amount | lb | rich\n'+
    p+' zoo | animal name | hunt | sell animal [amount] | sell all\n'+
    p+' shop | buy item | weapons | equip weapon | unequip\n'+p+' achievements | drop amount\n'+
    p+' settings prefix <value> | settings cash <name>') ]});

  if(cmd==='bal'||cmd==='cash')return void m.reply({embeds:[emb('Global Wallet','Balance: '+fmt(Number(u.balance))+' '+s.cash_name+'\nBank: '+fmt(Number(u.bank||0))+' '+s.cash_name+'\nGlobal across every server.\nStatus: Active')]});
  if(cmd==='profile'||cmd==='stats'){const inv=await items(m.author.id);return void m.reply({embeds:[emb('UWU Profile','<@'+m.author.id+'>\nLevel: '+u.level+'\nXP: '+fmt(Number(u.xp||0))+'\nWallet: '+fmt(Number(u.balance))+' '+s.cash_name+'\nBank: '+fmt(Number(u.bank||0))+' '+s.cash_name+'\nCollection: '+inv.length+' different items\nDaily streak: '+(u.daily_streak||0))]})}
  if(cmd==='rich'){const r=await db.from('users').select('discord_user_id,balance,bank').eq('disabled',false).order('balance',{ascending:false}).limit(10);const lines=(r.data||[]).map((x:any,i:number)=>(i+1)+'. <@'+x.discord_user_id+'> — '+fmt(Number(x.balance)+Number(x.bank||0))+' '+s.cash_name).join('\n');return void m.reply({embeds:[emb('Rich List',lines||'No users yet.')]})}
  if(cmd==='lb'){const r=await db.from('users').select('discord_user_id,balance').eq('disabled',false).order('balance',{ascending:false}).limit(25);const lines=(r.data||[]).map((x:any,i:number)=>(i+1)+'. <@'+x.discord_user_id+'> — '+fmt(Number(x.balance))+' '+s.cash_name).join('\n');return void m.reply({embeds:[emb('Global Leaderboard',lines||'No users yet.')]})}

  if(cmd==='bank'){
    const sub=(a.shift()||'').toLowerCase(),amount=Math.floor(Number(a[0]));
    if(!['deposit','withdraw'].includes(sub)||!Number.isFinite(amount)||amount<1)return void m.reply('Usage: '+p+' bank deposit <amount> OR bank withdraw <amount>');
    if(sub==='deposit'){if(Number(u.balance)<amount)return void m.reply('Insufficient wallet balance.');await change(m.author.id,-amount,'bank_deposit');await db.from('users').update({bank:Number(u.bank||0)+amount}).eq('discord_user_id',m.author.id)}
    else {if(Number(u.bank||0)<amount)return void m.reply('Insufficient bank balance.');await db.from('users').update({bank:Number(u.bank||0)-amount}).eq('discord_user_id',m.author.id);await change(m.author.id,amount,'bank_withdraw')}
    return void m.reply({embeds:[emb('Bank',sub==='deposit'?'Deposited ':'Withdrew '+fmt(amount)+' '+s.cash_name+'\nWallet: '+fmt(sub==='deposit'?Number(u.balance)-amount:Number(u.balance)+amount)+' '+s.cash_name+'\nBank: '+fmt(sub==='deposit'?Number(u.bank||0)+amount:Number(u.bank||0)-amount)+' '+s.cash_name)]})
  }

  if(cmd==='pay'||cmd==='transfer'){const t=m.mentions.users.first(),amount=Math.floor(Number(a[1]||a[0]));if(!t||t.bot||t.id===m.author.id||!Number.isFinite(amount)||amount<1)return void m.reply('Usage: '+p+' pay @user amount');try{await user(t.id);await db.rpc('uwu_transfer',{p_from:m.author.id,p_to:t.id,p_amount:amount,p_type:'transfer'});return void m.reply({embeds:[emb('Payment Sent','Sent '+fmt(amount)+' '+s.cash_name+' to <@'+t.id+'>.')]})}catch{return void m.reply('Transfer failed: insufficient balance or target unavailable.')}}

  if(['daily','work','mine','hunt','fish'].includes(cmd)){
    const sec:any={daily:86400,work:1800,mine:300,hunt:900,fish:600},left=await cd(m.author.id,cmd,sec[cmd]);if(left)return void m.reply('Try again in '+left+'s.');
    if(cmd==='hunt'){
      const r=await db.from('catalog_items').select('*').eq('kind','animal');const pool:any[]=[];for(const x of r.data||[]){const w:any={Common:55,Uncommon:25,Rare:12,Epic:5,Legendary:2,Mythic:.8,Divine:.2}[x.rarity]||1;for(let i=0;i<Math.max(1,Math.round(w*10));i++)pool.push(x)}
      const animal=pool[Math.floor(Math.random()*pool.length)];if(animal){await giveItem(m.author.id,animal.id);await xp(m.author.id,Number(animal.xp||0));await unlock(m.author.id,'hunter_10');return void m.reply({embeds:[emb('Hunt Success',animal.emoji+' **'+animal.name+'**\nRarity: '+animal.rarity+'\nCollection XP: +'+animal.xp)]})}
    }
    const range:any={daily:[500,1500],work:[250,900],mine:[100,700],fish:[100,800]}[cmd];const reward=Math.floor(Math.random()*(range[1]-range[0]+1))+range[0];const bal=await change(m.author.id,reward,cmd);await xp(m.author.id,10);if(cmd==='daily')await db.from('users').update({daily_streak:Number(u.daily_streak||0)+1}).eq('discord_user_id',m.author.id);await checkAchievements(m.author.id);return void m.reply({embeds:[emb(cmd.toUpperCase(),'Earned '+fmt(reward)+' '+s.cash_name+'\nBalance: '+fmt(bal)+' '+s.cash_name)]})
  }

  if(cmd==='cf'){const bet=Math.floor(Number(a[0]));if(!Number.isFinite(bet)||bet<1||bet>MAX_CF)return void m.reply('Usage: '+p+' cf amount. Max '+fmt(MAX_CF));if(Number(u.balance)<bet)return void m.reply('Insufficient balance.');const win=Math.random()<.5,bal=await change(m.author.id,win?bet:-bet,'coinflip',{result:win?'heads':'tails'});await xp(m.author.id,5);return void m.reply({embeds:[emb(win?'COIN FLIP — WIN':'COIN FLIP — LOSS','Result: '+(win?'HEADS':'TAILS')+'\n'+(win?'Won':'Lost')+' '+fmt(bet)+' '+s.cash_name+'\nBalance: '+fmt(bal)+' '+s.cash_name)]})}

  if(cmd==='zoo'||cmd==='weapons'||cmd==='inv'||cmd==='inventory'){
    const kind=cmd==='zoo'?'animal':cmd==='weapons'?'weapon':undefined,r=await items(m.author.id,kind);
    const lines=r.map((x:any)=>x.catalog_items.emoji+' **'+x.catalog_items.name+'** x'+x.quantity+' — '+x.catalog_items.rarity+(x.equipped?' [EQUIPPED]':'')).join('\n');
    return void m.reply({embeds:[emb(kind==='animal'?'Zoo':kind==='weapon'?'Weapons':'Inventory',lines||'Nothing collected yet.')]})
  }
  if(cmd==='animal'){const name=(a.join(' ')||'').toLowerCase();if(!name)return void m.reply('Usage: '+p+' animal <name>');const r=await db.from('catalog_items').select('*').eq('kind','animal').ilike('name',name).maybeSingle();if(!r.data)return void m.reply('Animal not found.');return void m.reply({embeds:[emb(r.data.emoji+' '+r.data.name,'Rarity: '+r.data.rarity+'\nSell price: '+fmt(r.data.sell_price)+' '+s.cash_name+'\nXP: '+r.data.xp)]})}
  if(cmd==='sell'){
    const target=(a[0]||'').toLowerCase();if(target==='all'){const inv=await items(m.author.id);let total=0;for(const x of inv){total+=Number(x.catalog_items.sell_price)*x.quantity;await db.from('inventory').delete().eq('discord_user_id',m.author.id).eq('item_id',x.catalog_items.id)}if(!total)return void m.reply('Nothing to sell.');const bal=await change(m.author.id,total,'sell_all');return void m.reply({embeds:[emb('Sold All','Received '+fmt(total)+' '+s.cash_name+'\nBalance: '+fmt(bal))]})}
    const name=a.join(' ').toLowerCase(),r=await db.from('catalog_items').select('*').or('name.ilike.'+name+',id.eq.'+name).maybeSingle();if(!r.data)return void m.reply('Item not found.');const inv=await db.from('inventory').select('*').eq('discord_user_id',m.author.id).eq('item_id',r.data.id).maybeSingle();if(!inv.data||inv.data.quantity<1)return void m.reply('You do not own that item.');await db.from('inventory').update({quantity:inv.data.quantity-1}).eq('discord_user_id',m.author.id).eq('item_id',r.data.id);const bal=await change(m.author.id,Number(r.data.sell_price),'sell',{item:r.data.id});return void m.reply('Sold '+r.data.name+' for '+fmt(r.data.sell_price)+' '+s.cash_name+'. Balance: '+fmt(bal))}
  if(cmd==='shop'){const r=await db.from('catalog_items').select('*').order('sell_price',{ascending:true}).limit(25);const lines=(r.data||[]).map((x:any)=>x.emoji+' **'+x.name+'** — '+fmt(Number(x.sell_price)*2)+' '+s.cash_name+' | '+x.rarity).join('\n');return void m.reply({embeds:[emb('UWU Shop',lines+'\n\nBuy with: '+p+' buy <item>')]})}
  if(cmd==='buy'){const name=a.join(' ').toLowerCase(),r=await db.from('catalog_items').select('*').or('name.ilike.'+name+',id.eq.'+name).maybeSingle();if(!r.data)return void m.reply('Item not found.');const price=Number(r.data.sell_price)*2;if(Number(u.balance)<price)return void m.reply('Insufficient balance.');await change(m.author.id,-price,'shop_buy',{item:r.data.id});await giveItem(m.author.id,r.data.id);return void m.reply({embeds:[emb('Purchase Complete',r.data.emoji+' '+r.data.name+'\nPaid: '+fmt(price)+' '+s.cash_name)]})}
  if(cmd==='equip'||cmd==='unequip'){const name=(a.join(' ')||'').toLowerCase();if(cmd==='unequip'){await db.from('inventory').update({equipped:false}).eq('discord_user_id',m.author.id).eq('equipped',true);return void m.reply('All equipment unequipped.')}const r=await db.from('catalog_items').select('*').eq('kind','weapon').or('name.ilike.'+name+',id.eq.'+name).maybeSingle();if(!r.data)return void m.reply('Weapon not found.');const own=await db.from('inventory').select('quantity').eq('discord_user_id',m.author.id).eq('item_id',r.data.id).maybeSingle();if(!own.data?.quantity)return void m.reply('You do not own that weapon.');await db.from('inventory').update({equipped:false}).eq('discord_user_id',m.author.id);await db.from('inventory').update({equipped:true}).eq('discord_user_id',m.author.id).eq('item_id',r.data.id);return void m.reply('Equipped **'+r.data.name+'**.')}
  if(cmd==='achievements'){const r=await db.from('achievements').select('*').order('id');const got=await db.from('user_achievements').select('achievement_id').eq('discord_user_id',m.author.id);const set=new Set((got.data||[]).map((x:any)=>x.achievement_id));const lines=(r.data||[]).map((x:any)=>(set.has(x.id)?'✅':'⬜')+' **'+x.name+'** — '+x.description+' | '+fmt(x.reward)).join('\n');return void m.reply({embeds:[emb('Achievements',lines)]})}

  if(cmd==='drop' || ['addcash','removecash','setcash','resetuser','useroff','useron','userstatus','forcecooldown','economy','maintenance','broadcast','shutdown'].includes(cmd)){
    if(m.author.id!==e.BOT_OWNER_ID)return void m.reply('Owner only.');
    if(cmd==='shutdown'){const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('shutdown_yes').setLabel('Shutdown').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId('shutdown_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary));return void m.reply({embeds:[emb('Shutdown','Confirm UWU shutdown?')],components:[row]})}
    if(cmd==='drop'){const amount=Math.floor(Number(a[0])),claims=Math.max(1,Math.floor(Number(a[1]||5)));if(!amount||amount<claims)return void m.reply('Usage: '+p+' drop <amount> [claims]');if(Number(u.balance)<amount)return void m.reply('Insufficient owner balance.');await change(m.author.id,-amount,'cash_drop_create',{claims});const r=await db.from('cash_drops').insert({guild_id:m.guild.id,creator_user_id:m.author.id,amount,max_claims:claims,expires_at:new Date(Date.now()+300000).toISOString()}).select().single();const share=Math.floor(amount/claims);const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('drop_'+r.data.id).setLabel('Claim '+fmt(share)).setStyle(ButtonStyle.Success));return void m.channel.send({embeds:[emb('UWU Cash Drop',fmt(amount)+' '+s.cash_name+'\nClaims: '+claims+'\nEach claim: '+fmt(share)+'\nExpires in 5 minutes.')],components:[row]})}
    const t=m.mentions.users.first();
    if(cmd==='broadcast')return void m.channel.send(a.join(' ')||'UWU broadcast');
    if(cmd==='maintenance')return void m.reply('Maintenance command reserved for dashboard controls.');
    if(cmd==='economy')return void m.reply({embeds:[emb('Economy Admin','Global wallet system active. Atomic balance RPC enabled.')]});
    if(!t)return void m.reply('Mention a user.');
    await user(t.id);
    if(cmd==='userstatus'){const x=await user(t.id);return void m.reply('Disabled: '+x.disabled+' | Balance: '+fmt(Number(x.balance)));}
    if(cmd==='useroff'||cmd==='useron'){await db.from('users').update({disabled:cmd==='useroff'}).eq('discord_user_id',t.id);await db.from('audit_logs').insert({actor_user_id:m.author.id,target_user_id:t.id,action:cmd});return void m.reply(cmd==='useroff'?'User disabled.':'User enabled.')}
    if(cmd==='resetuser'){await db.from('inventory').delete().eq('discord_user_id',t.id);await db.from('users').update({balance:START,bank:0,xp:0,level:1,daily_streak:0,started:false}).eq('discord_user_id',t.id);return void m.reply('User economy reset.')}
    if(cmd==='forcecooldown'){await db.from('cooldowns').delete().eq('discord_user_id',t.id);return void m.reply('Cooldowns cleared.')}
    const amount=Math.floor(Number(a[1]||a[0]));if(!Number.isFinite(amount)||amount<0)return void m.reply('Invalid amount.');
    if(cmd==='setcash')await db.from('users').update({balance:amount}).eq('discord_user_id',t.id);else await change(t.id,cmd==='addcash'?amount:-amount,'owner_'+cmd,{actor:m.author.id});
    await db.from('audit_logs').insert({actor_user_id:m.author.id,target_user_id:t.id,amount,action:cmd});return void m.reply(cmd+' completed.');
  }

  if(cmd==='settings'){
    if(!m.member?.permissions.has('ManageGuild'))return void m.reply('Manage Server permission required.');
    const sub=(a.shift()||'').toLowerCase(),value=a.join(' ');if(!['prefix','cash'].includes(sub)||!value)return void m.reply('Usage: '+p+' settings prefix <value> OR settings cash <name>');
    if(sub==='prefix'){if(value.length>8)return void m.reply('Prefix max 8 characters.');await db.from('guild_settings').update({prefix:value}).eq('guild_id',m.guild.id)}
    else {if(value.length>20)return void m.reply('Cash name max 20 characters.');await db.from('guild_settings').update({cash_name:value}).eq('guild_id',m.guild.id)}
    return void m.reply('Server settings updated.');
  }
 }catch(err){console.error(err);await m.reply('Internal error. Check logs.').catch(()=>{})}
});

client.on(Events.InteractionCreate,async i=>{
 if(!i.isButton())return;
 if(i.customId==='shutdown_no')return void i.update({content:'Shutdown cancelled.',embeds:[],components:[]});
 if(i.customId==='shutdown_yes'){if(i.user.id!==e.BOT_OWNER_ID)return void i.reply({content:'Owner only.',ephemeral:true});await i.update({content:'UWU shutting down...',embeds:[],components:[]});await client.destroy();process.exit(0)}
 if(i.customId.startsWith('drop_')){
   const id=Number(i.customId.slice(5)),d=await db.from('cash_drops').select('*').eq('id',id).eq('active',true).maybeSingle();
   if(!d.data||new Date(d.data.expires_at).getTime()<Date.now())return void i.reply({content:'This drop has expired.',ephemeral:true});
   if(d.data.claimed_count>=d.data.max_claims)return void i.reply({content:'All claims are gone.',ephemeral:true});
   const existing=await db.from('cash_drop_claims').select('drop_id').eq('drop_id',id).eq('discord_user_id',i.user.id).maybeSingle();if(existing.data)return void i.reply({content:'Already claimed.',ephemeral:true});
   const share=Math.floor(Number(d.data.amount)/Number(d.data.max_claims));await user(i.user.id);await change(i.user.id,share,'cash_drop_claim',{drop_id:id});await db.from('cash_drop_claims').insert({drop_id:id,discord_user_id:i.user.id,amount:share});const next=Number(d.data.claimed_count)+1;await db.from('cash_drops').update({claimed_count:next,active:next<d.data.max_claims}).eq('id',id);return void i.reply({content:'Claimed '+fmt(share)+' UwU!',ephemeral:true});
 }
});
process.on('SIGTERM',()=>{client.destroy().finally(()=>process.exit(0))});
client.login(e.DISCORD_TOKEN);
