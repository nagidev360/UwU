create table if not exists users (
 discord_user_id text primary key,
 balance bigint not null default 1000 check(balance>=0),
 bank bigint not null default 0 check(bank>=0),
 started boolean not null default false,
 disabled boolean not null default false,
 xp bigint not null default 0,
 level integer not null default 1,
 daily_streak integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists guild_settings (
 guild_id text primary key,
 prefix text not null default 'UwU',
 cash_name text not null default 'UwU',
 updated_at timestamptz not null default now()
);
create table if not exists cooldowns (
 discord_user_id text references users(discord_user_id) on delete cascade,
 command text not null,
 expires_at timestamptz not null,
 primary key(discord_user_id,command)
);
create table if not exists transactions (
 id bigint generated always as identity primary key,
 discord_user_id text references users(discord_user_id) on delete cascade,
 type text not null,
 amount bigint not null,
 metadata jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create table if not exists catalog_items (
 id text primary key,
 kind text not null check(kind in('animal','weapon','item')),
 name text not null,
 emoji text not null default '📦',
 rarity text not null default 'Common',
 sell_price bigint not null default 0,
 xp integer not null default 0,
 metadata jsonb not null default '{}'
);
create table if not exists inventory (
 discord_user_id text references users(discord_user_id) on delete cascade,
 item_id text references catalog_items(id) on delete cascade,
 quantity integer not null default 0 check(quantity>=0),
 primary key(discord_user_id,item_id)
);
create table if not exists audit_logs (
 id bigint generated always as identity primary key,
 actor_user_id text not null,
 action text not null,
 target_user_id text,
 amount bigint,
 metadata jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create index if not exists idx_users_balance on users(balance desc);
create index if not exists idx_transactions_user_time on transactions(discord_user_id,created_at desc);
insert into catalog_items(id,kind,name,emoji,rarity,sell_price,xp) values
('rabbit','animal','Rabbit','🐇','Common',100,10),
('fox','animal','Fox','🦊','Uncommon',500,25),
('wolf','animal','Wolf','🐺','Rare',1500,60),
('tiger','animal','Tiger','🐯','Epic',5000,150),
('dragon','animal','Dragon','🐉','Legendary',25000,500),
('unicorn','animal','Unicorn','🦄','Mythic',100000,1000),
('celestial','animal','Celestial','✨','Divine',500000,2500)
on conflict(id) do nothing;

-- UWU expansion: persistent drops, achievements, equipment, and atomic wallet operations.
create table if not exists cash_drops (
 id bigint generated always as identity primary key,
 guild_id text,
 creator_user_id text not null references users(discord_user_id) on delete cascade,
 amount bigint not null check(amount>0),
 max_claims integer not null default 1 check(max_claims>0),
 claimed_count integer not null default 0 check(claimed_count>=0),
 expires_at timestamptz not null,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists cash_drop_claims (
 drop_id bigint references cash_drops(id) on delete cascade,
 discord_user_id text references users(discord_user_id) on delete cascade,
 amount bigint not null check(amount>0),
 claimed_at timestamptz not null default now(),
 primary key(drop_id,discord_user_id)
);
create table if not exists achievements (
 id text primary key,
 name text not null,
 description text not null,
 reward bigint not null default 0 check(reward>=0),
 xp integer not null default 0 check(xp>=0)
);
create table if not exists user_achievements (
 discord_user_id text references users(discord_user_id) on delete cascade,
 achievement_id text references achievements(id) on delete cascade,
 unlocked_at timestamptz not null default now(),
 primary key(discord_user_id,achievement_id)
);
alter table inventory add column if not exists equipped boolean not null default false;
create index if not exists idx_cash_drops_active on cash_drops(active,expires_at);
create index if not exists idx_drop_claims_user on cash_drop_claims(discord_user_id);

insert into catalog_items(id,kind,name,emoji,rarity,sell_price,xp,metadata) values
('shadow_blade','weapon','Shadow Blade','🗡️','Epic',8000,100,'{"power":75}'),
('dragon_sword','weapon','Dragon Sword','⚔️','Legendary',30000,350,'{"power":150}'),
('void_spear','weapon','Void Spear','🔱','Mythic',75000,800,'{"power":300}'),
('phoenix_bow','weapon','Phoenix Bow','🏹','Mythic',100000,1000,'{"power":400}'),
('arcane_staff','weapon','Arcane Staff','🪄','Legendary',45000,500,'{"power":220}'),
('divine_blade','weapon','Divine Blade','✨','Divine',250000,2500,'{"power":750}')
on conflict(id) do nothing;

insert into achievements(id,name,description,reward,xp) values
('first_start','First Steps','Activate your UWU account.',100,25),
('rich_10k','Pocket Change','Reach 10,000 wallet cash.',500,50),
('rich_1m','Millionaire','Reach 1,000,000 wallet cash.',10000,500),
('collector_5','Collector','Own 5 different catalog items.',1000,100),
('hunter_10','Hunter','Complete 10 successful hunts.',2500,150)
on conflict(id) do nothing;

create or replace function uwu_change_balance(p_user text,p_delta bigint,p_type text,p_metadata jsonb default '{}'::jsonb)
returns bigint language plpgsql as $$
declare v_balance bigint;
begin
 update users set balance=balance+p_delta,updated_at=now()
 where discord_user_id=p_user and disabled=false and balance+p_delta>=0
 returning balance into v_balance;
 if not found then raise exception 'INSUFFICIENT_OR_DISABLED'; end if;
 insert into transactions(discord_user_id,type,amount,metadata) values(p_user,p_type,p_delta,coalesce(p_metadata,'{}'::jsonb));
 return v_balance;
end; $$;

create or replace function uwu_transfer(p_from text,p_to text,p_amount bigint,p_type text default 'transfer')
returns boolean language plpgsql as $$
begin
 if p_amount<=0 or p_from=p_to then raise exception 'INVALID_TRANSFER'; end if;
 if not exists(select 1 from users where discord_user_id=p_to and disabled=false) then raise exception 'TARGET_DISABLED_OR_MISSING'; end if;
 perform uwu_change_balance(p_from,-p_amount,p_type||'_out','{}');
 perform uwu_change_balance(p_to,p_amount,p_type||'_in','{}');
 return true;
exception when others then raise;
end; $$;


create or replace function uwu_add_item(p_user text,p_item text,p_quantity integer)
returns integer language plpgsql as $$
declare v_qty integer;
begin
 if p_quantity<=0 then raise exception 'INVALID_QUANTITY'; end if;
 insert into inventory(discord_user_id,item_id,quantity)
 values(p_user,p_item,p_quantity)
 on conflict(discord_user_id,item_id)
 do update set quantity=inventory.quantity+excluded.quantity
 returning quantity into v_qty;
 return v_qty;
end; $$;
