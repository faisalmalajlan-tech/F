-- ═══════════════════════════════════════════════════════════════
-- نذير — مخطّط قاعدة البيانات على Supabase
-- شغّل هذا الملف كاملًا في: Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════

-- ── ١) الجداول ──

create table if not exists public.docs (
  id           text primary key,
  name         text not null default '',
  text         text not null default '',
  ref_text     text not null default '',
  ref_name     text default '',
  doc_type     text default '',
  context      text default '',
  case_code    text default '',
  fp           text default '',
  version      int  default 1,
  parent_id    text,
  origin       jsonb,
  is_draft     boolean default false,
  truncated    boolean default false,
  history      jsonb default '[]'::jsonb,
  tasks        jsonb default '{}'::jsonb,
  last_risk    numeric default 0,
  added_at     bigint,
  updated_at   timestamptz default now(),
  updated_by   text default ''
);

create table if not exists public.requests (
  id          text primary key,
  at          bigint,
  actor       text default '',
  actor_id    text default '',
  action      text default '',
  title       text default '',
  detail      text default '',
  code        text default '',
  version_id  text default '',
  status      text default 'pending',
  decided_at  bigint default 0,
  decided_by  text default '',
  updated_at  timestamptz default now()
);

create table if not exists public.versions (
  id         text primary key,
  at         bigint,
  label      text default '',
  actor      text default '',
  docs       jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- صفٌّ واحد يحمل إعدادات المحرك المشتركة بين الجميع
create table if not exists public.settings (
  id         int primary key default 1,
  config     jsonb,
  -- كلمةٌ معلومة مُعمّاة بعبارة الفريق: من يكتب عبارةً خاطئة يُكتشف
  -- فورًا بدل أن يرى مستنداتٍ فارغة بلا تفسير.
  probe      text,
  updated_at timestamptz default now(),
  updated_by text default '',
  constraint settings_single_row check (id = 1)
);

-- الحسابات: الاسم والدور وبصمة الرمز. ليست مصادقة حقيقية —
-- انظر التحذير في الأسفل.
create table if not exists public.accounts (
  id         text primary key,
  name       text not null,
  role       text not null default 'user',
  code_hash  text not null,
  active     boolean default true,
  seeded     boolean default true,
  updated_at timestamptz default now()
);

-- ── ٢) الفهارس ──
create index if not exists docs_updated_idx     on public.docs (updated_at desc);
create index if not exists requests_status_idx  on public.requests (status, at desc);
create index if not exists versions_at_idx      on public.versions (at desc);

-- ── ٣) أمن الصفوف ──
-- ⚠ هذه السياسات تفتح الجداول لحامل المفتاح العام (anon).
-- تعني: من يعرف رابط مشروعك ومفتاحه يستطيع القراءة والكتابة.
--
-- لكن نصوص المستندات **مُعمّاة في المتصفح** قبل أن تصل هنا
-- (AES-GCM ٢٥٦، ومفتاحها مشتقّ من عبارة الفريق التي لا تُرسل أبدًا).
-- فمن يقرأ هذه الجداول — أو يسرّبها — لا يجد إلا رموزًا. تبقى ظاهرةً:
-- أسماء المستندات وأكوادها ودرجات خطرها، وهي بذاتها معلومات.
--
-- ومع ذلك يبقى بوسع حامل المفتاح **الحذف والإفساد**. لمنع ذلك:
-- فعّل Supabase Auth واستبدل using(true) بشرطٍ على auth.uid().

alter table public.docs      enable row level security;
alter table public.requests  enable row level security;
alter table public.versions  enable row level security;
alter table public.settings  enable row level security;
alter table public.accounts  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['docs','requests','versions','settings','accounts'] loop
    execute format('drop policy if exists %I on public.%I', t||'_all', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t||'_all', t);
  end loop;
end $$;

-- ── ٤) الحسابات الأولية ──
-- البصمة تُحسب بالخوارزمية نفسها في التطبيق (djb2 بصيغة 36).
insert into public.accounts (id, name, role, code_hash, active, seeded) values
  ('admin',  'مدير النظام', 'admin', '', true, true),
  ('faisal', 'فيصل',        'user',  '', true, true),
  ('rawan',  'روان',        'user',  '', true, true),
  ('safiah', 'صفية',        'user',  '', true, true)
on conflict (id) do nothing;

-- تمّ. انسخ من Settings → API:
--   Project URL   → يوضع في التطبيق
--   anon public   → يوضع في التطبيق
