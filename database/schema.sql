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