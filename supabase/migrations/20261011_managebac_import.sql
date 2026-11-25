-- =====================================================================
-- TBS Student Portfolio · Import from ManageBac (run AFTER 20261010)
--   · Journey moments remember where they came from, so a newer
--     ManageBac report skips activities already imported
--   · Moments can be saved as private drafts
--   · Shows whether coaches can already manage students' moments
-- Safe to re-run. Nothing is deleted.
-- =====================================================================

alter table public.student_journey_entries add column if not exists import_source text;
alter table public.student_journey_entries add column if not exists import_key text;
alter table public.student_journey_entries add column if not exists end_date date;

create index if not exists student_journey_entries_import_key
  on public.student_journey_entries (student_id, import_key)
  where import_key is not null;

-- Allow 'draft' wherever the status is checked.
do $$
declare
  c record;
  fixed boolean := false;
begin
  for c in
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.student_journey_entries'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%verification_status%'
  loop
    if c.def not ilike '%draft%' then
      execute format('alter table public.student_journey_entries drop constraint %I', c.conname);
      fixed := true;
    end if;
  end loop;
  if fixed then
    alter table public.student_journey_entries
      add constraint student_journey_entries_verification_status_check
      check (verification_status in ('draft', 'submitted', 'approved', 'verified', 'rejected')) not valid;
  end if;
end $$;

select
  'OK' as managebac_import,
  (select bool_or(pg_get_functiondef(p.oid) ilike '%coach%')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'journey_can_manage') as coaches_can_manage_students;
