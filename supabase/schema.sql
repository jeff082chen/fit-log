-- fit-log 資料庫結構
-- 在 Supabase 的 SQL Editor 貼上整份並執行一次即可（重複執行也安全）。

-- 個人設定：身高、出生日期、Cycle 目標、各類別動作清單
create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  height_cm numeric not null default 172,
  birth_date date not null default '2002-08-02',
  cycle_targets jsonb not null default '[
    {"item":"腿","target":2},{"item":"推","target":1},{"item":"拉","target":1},
    {"item":"背","target":2},{"item":"核心","target":2},{"item":"HIIT","target":1},
    {"item":"輔助引體","target":3},{"item":"爬山","target":1}]'::jsonb,
  exercises jsonb not null default '{
    "腿":["高腳杯深蹲","保加利亞分腿蹲","槓鈴硬舉","槓鈴臀橋","小腿提踵"],
    "推":["臥推","上斜臥推","仰臥臂屈伸","肩推","側平舉","啞鈴夾胸","伏地挺身"],
    "拉":["槓鈴划船","仰臥拉舉","俯身飛鳥","二頭彎舉","反握彎舉","腕彎舉","反握腕彎舉"],
    "引體":["輔助反握引體","輔助肩胛骨引體"],
    "核心":["捲腹","抬腿","俄羅斯轉體"]}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 訓練紀錄：一列 = 某天一個動作（單邊動作則是一側）
-- sets: [{"kg": 數字或 null, "reps": 數字}]，kg 為 null 代表沿用前一組
create table if not exists public.workouts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  category text not null check (category in ('腿','推','拉','引體','核心')),
  exercise text not null,
  side text not null default '雙' check (side in ('雙','左','右')),
  body_weight numeric,
  sets jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now()
);

-- 每日紀錄：一列 = 某天完成的一個項目；「開始新 Cycle」為換輪標記
create table if not exists public.daily_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  item text not null,
  note text,
  created_at timestamptz not null default now()
);

-- 身體組成
create table if not exists public.body_metrics (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  weight numeric,
  body_fat_pct numeric,
  smm numeric,
  created_at timestamptz not null default now()
);

create index if not exists workouts_user_date on public.workouts (user_id, date);
create index if not exists daily_logs_user_date on public.daily_logs (user_id, date);
create index if not exists body_metrics_user_date on public.body_metrics (user_id, date);

-- 權限：每個人只能讀寫自己的資料
alter table public.settings enable row level security;
alter table public.workouts enable row level security;
alter table public.daily_logs enable row level security;
alter table public.body_metrics enable row level security;

do $$
declare t text;
begin
  foreach t in array array['settings','workouts','daily_logs','body_metrics'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated
                    using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
