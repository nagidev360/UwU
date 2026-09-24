# UWU

Production foundation for a global Discord economy + collection bot.

## Setup
1. Create a Supabase project and run database/schema.sql.
2. Copy .env.example to .env.
3. Add Discord token, owner ID and Supabase service-role key.
4. Enable Discord Message Content Intent.
5. npm install && npm run build && npm start

## Global economy
Wallets are keyed only by Discord user ID. Guild ID is never used for balances.

## Commands
UwU start, bal, daily, work, mine, hunt, fish, cf amount, transfer @user amount, lb, inv, zoo, weapons, drop amount.

## Owner
addcash, removecash, setcash, useroff, useron, shutdown.

Never commit secrets or the Supabase service-role key.
