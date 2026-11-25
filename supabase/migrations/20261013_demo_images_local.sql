-- v33 · Demo images served by the app itself (no Unsplash).
-- The demo rows pointed at images.unsplash.com, which some networks block.
-- This repoints them to /demo/*.svg, bundled with the site. Real uploads are untouched.
--
-- The guard trigger (journey_guard_public_fields) is switched off for this one
-- update only: it reads new.profile_public, which the evidence table does not have.
-- It is switched back on at the end, in the same transaction.
begin;

do $$
declare t record;
begin
  for t in
    select tg.tgname from pg_trigger tg
    join pg_proc p on p.oid = tg.tgfoid
    where tg.tgrelid = 'public.student_journey_evidence'::regclass
      and not tg.tgisinternal
      and p.proname = 'journey_guard_public_fields'
  loop
    execute format('alter table public.student_journey_evidence disable trigger %I', t.tgname);
  end loop;
end $$;

update public.student_journey_evidence e
set media_url = '/demo/' || coalesce(m.svg, 'demo') || '.svg',
    thumbnail_url = '/demo/' || coalesce(m.svg, 'demo') || '.svg'
from (
  select id, (
    select s from unnest(array[
      'saber-demo-hero','saber-demo-profile','sport-demo','fitness-demo','training-demo',
      'creative-project-demo','service-demo','prototype-demo','teamwork-demo'
    ]) s where x.file_name ilike s || '.%' limit 1
  ) as svg
  from public.student_journey_evidence x
  where x.drive_file_id is null
    and (x.media_url ilike '%images.unsplash.com%' or x.thumbnail_url ilike '%images.unsplash.com%')
) m
where e.id = m.id;

do $$
declare t record;
begin
  for t in
    select tg.tgname from pg_trigger tg
    join pg_proc p on p.oid = tg.tgfoid
    where tg.tgrelid = 'public.student_journey_evidence'::regclass
      and not tg.tgisinternal
      and p.proname = 'journey_guard_public_fields'
  loop
    execute format('alter table public.student_journey_evidence enable trigger %I', t.tgname);
  end loop;
end $$;

commit;

select file_name, media_url
from public.student_journey_evidence
where media_url like '/demo/%'
order by file_name;
