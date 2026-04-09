do $$
begin
  if exists (select 1 from pg_extension where extname = 'pgcrypto') then
    execute 'alter extension pgcrypto set schema public';
  else
    create extension if not exists pgcrypto with schema public;
  end if;
end
$$;
