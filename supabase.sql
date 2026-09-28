create extension if not exists pgcrypto;

-- ============================================================
-- LANGUAGE LEARNING PRO: SHARED LESSONS + PERSONAL PROGRESS
-- Nội dung công khai dùng chung; tiến độ luôn riêng theo user.
-- Chạy script này trong Supabase SQL Editor. Script có thể chạy lại.
-- ============================================================

create table if not exists profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  email text, display_name text, avatar_url text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists languages(
  id uuid primary key default gen_random_uuid(),
  code text unique not null, name text not null, flag text,
  created_at timestamptz default now()
);
insert into languages(code,name,flag) values
  ('zh','Tiếng Trung','🇨🇳'),('en','Tiếng Anh','🇬🇧')
on conflict(code) do nothing;

-- user_id = tài khoản tạo nội dung. Không còn dùng để giới hạn SELECT.
create table if not exists lessons(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  language_id uuid not null references languages(id),
  no int, level text,
  tieng_trung text not null, pinyin text, tieng_viet text not null, giai_thich text,
  visibility text not null default 'public' check(visibility in('public','private')),
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table lessons add column if not exists visibility text;
update lessons set visibility='public' where visibility is null;
alter table lessons alter column visibility set default 'public';
alter table lessons alter column visibility set not null;
alter table lessons drop constraint if exists lessons_visibility_check;
alter table lessons add constraint lessons_visibility_check check(visibility in('public','private'));

create table if not exists learning_sessions(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  language_id uuid references languages(id), mode text not null, level text,
  total_items int default 0, completed_items int default 0, current_index int default 0,
  correct_count int default 0, wrong_count int default 0, accuracy numeric default 0,
  started_at timestamptz default now(), last_activity_at timestamptz default now(), completed_at timestamptz,
  status text default 'IN_PROGRESS' check(status in('IN_PROGRESS','COMPLETED','ABANDONED'))
);

create table if not exists learning_session_items(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references learning_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  question_index int not null, is_answered boolean default false, is_correct boolean,
  answer text, attempt_count int default 0, answered_at timestamptz, created_at timestamptz default now()
);

create table if not exists user_progress(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  status text default 'NEW' check(status in('NEW','LEARNING','REVIEW','MASTERED')),
  correct_count int default 0, wrong_count int default 0, last_grade smallint,
  last_studied timestamptz, next_review timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique(user_id,lesson_id)
);

create table if not exists wrong_answers(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  wrong_count int default 0, correct_count int default 0, last_wrong timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique(user_id,lesson_id)
);

create table if not exists daily_study_logs(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  study_date date not null, language_id uuid not null references languages(id),
  questions_completed int default 0, correct_count int default 0, wrong_count int default 0, study_minutes int default 0,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique(user_id,study_date,language_id)
);

create table if not exists study_bookmarks(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id,lesson_id)
);

-- Index
create index if not exists i_les_public on lessons(language_id,visibility,level,no);
create index if not exists i_les_owner on lessons(user_id,language_id,level,no);
create index if not exists i_prog on user_progress(user_id,next_review);
create index if not exists i_wrong on wrong_answers(user_id,last_wrong desc);
create index if not exists i_ses on learning_sessions(user_id,status,last_activity_at desc);
create index if not exists i_items on learning_session_items(session_id,question_index);

-- RLS
alter table lessons enable row level security;
drop policy if exists own_all on lessons;
drop policy if exists lessons_select on lessons;
drop policy if exists lessons_insert on lessons;
drop policy if exists lessons_update on lessons;
drop policy if exists lessons_delete on lessons;
create policy lessons_select on lessons for select to authenticated
  using(visibility='public' or user_id=auth.uid());
create policy lessons_insert on lessons for insert to authenticated
  with check(user_id=auth.uid());
create policy lessons_update on lessons for update to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy lessons_delete on lessons for delete to authenticated
  using(user_id=auth.uid());

alter table profiles enable row level security;
drop policy if exists p_self on profiles;
create policy p_self on profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());

alter table languages enable row level security;
drop policy if exists l_read on languages;
create policy l_read on languages for select to authenticated using(true);

-- Các bảng tiến độ/session chỉ user sở hữu được đọc/ghi.
do $$ declare t text; begin
  foreach t in array array['learning_sessions','learning_session_items','user_progress','wrong_answers','daily_study_logs','study_bookmarks'] loop
    execute format('alter table %I enable row level security',t);
    execute format('drop policy if exists own_all on %I',t);
    execute format('create policy own_all on %I for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid())',t);
  end loop;
end $$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into profiles(id,email,display_name)
  values(new.id,new.email,split_part(new.email,'@',1)) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure handle_new_user();

-- Trả về level của toàn bộ nội dung mà tài khoản hiện tại được phép xem.
create or replace function user_levels(p_language uuid)
returns table(level text)
language sql stable security invoker as $$
  select distinct l.level from lessons l
  where l.language_id=p_language and l.level is not null
  order by 1
$$;
