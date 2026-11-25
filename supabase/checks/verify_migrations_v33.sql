-- v33 · Verify every Student Journey migration (01 → 16) is in place.
-- READ-ONLY: it only looks things up. Nothing is created, changed or deleted.
-- Each row should say OK. Anything MISSING shows which migration to run.

with col as (
  select table_name, column_name from information_schema.columns where table_schema = 'public'
),
fn as (
  select p.proname, pg_get_functiondef(p.oid) as body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
pol as (
  select tablename, policyname, qual from pg_policies where schemaname = 'public'
),
checks(migration, what, ok) as (
  values
  ('20261001 portfolio_directory', 'portfolio_access_requests table',
     to_regclass('public.portfolio_access_requests') is not null),
  ('20261002 member_access', 'portfolio_access_grants table + is_portfolio_superadmin()',
     to_regclass('public.portfolio_access_grants') is not null
     and exists (select 1 from fn where proname = 'is_portfolio_superadmin')),
  ('20261003 open_by_default', 'student_journey_profiles.community_closed',
     exists (select 1 from col where table_name = 'student_journey_profiles' and column_name = 'community_closed')),
  ('20261004 requests_from_sign_in', 'index portfolio_access_requests_unmatched_idx',
     to_regclass('public.portfolio_access_requests_unmatched_idx') is not null),
  ('20261005 cv_quotes_admission', 'student_coach_quotes + students.admission_date + about_edited_at',
     to_regclass('public.student_coach_quotes') is not null
     and exists (select 1 from col where table_name = 'students' and column_name = 'admission_date')
     and exists (select 1 from col where table_name = 'student_journey_profiles' and column_name = 'about_edited_at')),
  ('20261006 award_builder', 'awards, award_nominations, award_staff, award_lists',
     to_regclass('public.awards') is not null and to_regclass('public.award_nominations') is not null
     and to_regclass('public.award_staff') is not null and to_regclass('public.award_lists') is not null),
  ('20261007 award_staff_subjects', 'award_staff.subjects + award_lists.year_groups',
     exists (select 1 from col where table_name = 'award_staff' and column_name = 'subjects')
     and exists (select 1 from col where table_name = 'award_lists' and column_name = 'year_groups')),
  ('20261008 award_staff_roles', 'award_staff_roles table + award_my_roles()',
     to_regclass('public.award_staff_roles') is not null
     and exists (select 1 from fn where proname = 'award_my_roles')),
  ('20261009 award_term_focus', 'awards.term_focus + award_nominations.focus',
     exists (select 1 from col where table_name = 'awards' and column_name = 'term_focus')
     and exists (select 1 from col where table_name = 'award_nominations' and column_name = 'focus')),
  ('20261010 award_teacher_role', 'Teacher (subject_teacher) role allowed',
     exists (select 1 from pg_constraint where conname = 'award_staff_roles_award_role_check'
             and pg_get_constraintdef(oid) like '%subject_teacher%')),
  ('20261011 managebac_import', 'student_journey_entries.import_key / import_source / end_date',
     (select count(*) from col where table_name = 'student_journey_entries'
        and column_name in ('import_key', 'import_source', 'end_date')) = 3),
  ('20261012 coach_journey_access', 'journey_is_coach() + coach policies',
     exists (select 1 from fn where proname = 'journey_is_coach')
     and (select count(*) from pol where policyname like 'Journey coaches %') >= 8),
  ('20261013 demo_images_local', 'no demo photos left on images.unsplash.com',
     not exists (select 1 from public.student_journey_evidence
                 where media_url ilike '%images.unsplash.com%' or thumbnail_url ilike '%images.unsplash.com%')),
  ('20261014 award_comment_lines', 'award_comment_lines table + policies',
     to_regclass('public.award_comment_lines') is not null
     and (select count(*) from pol where tablename = 'award_comment_lines') >= 5),
  ('20261015 award_comments_admin', 'Admin can edit award comments',
     exists (select 1 from fn where proname = 'award_comment_can_edit' and body ilike '%''admin''%')),
  ('20261016 award_publish_portfolio', 'publish columns + award_publish() + guard + family policy',
     (select count(*) from col where table_name = 'award_nominations'
        and column_name in ('published_to_portfolio', 'published_at', 'published_by_email')) = 3
     and exists (select 1 from fn where proname = 'award_publish')
     and exists (select 1 from fn where proname = 'award_nomination_guard' and body like '%award.publishing%')
     and exists (select 1 from pol where tablename = 'award_nominations' and policyname = 'nominations family read'
                 and qual like '%published_to_portfolio%'))
)
select migration,
       case when ok then 'OK' else 'MISSING' end as status,
       what as checks
from checks
order by migration;
