-- Student-written closing line for "My next chapter" (replaces the old fixed "THE IDEA" text).
alter table public.student_journey_profiles
  add column if not exists closing_thought text;

-- Include it in the public (secure link) portfolio payload.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.get_public_student_journey'::regproc);
  if position('closing_thought' in def) = 0 then
    def := replace(def, '''proud_moment'', p.proud_moment',
                        '''proud_moment'', p.proud_moment,' || chr(10) || '          ''closing_thought'', p.closing_thought');
    execute def;
  end if;
end $$;
