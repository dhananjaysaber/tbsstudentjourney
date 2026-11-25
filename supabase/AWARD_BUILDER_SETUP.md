# Award Builder (v33): how to switch it on

v33 is built on v31. The v32 coach team-scoping is **not** included.

Do the steps in this order. Until step 1 has run, the live site behaves exactly like v31: the award pages show "Awards are almost ready", and portfolios are unchanged.

## 1. Database (Supabase → SQL Editor)

1. Open `supabase/migrations/20261006_award_builder.sql`, copy all of it, paste it into a new query and press **Run**.
   If Supabase shows its "destructive operations" warning, choose **Run**. The file only adds new tables and functions; nothing existing is changed or deleted.
2. Check the classes. The app uses **Year Group exactly as it is in the student table** (e.g. `Yr6C`) as the class, and groups classes by year (`Yr6A`–`Yr6D` → Year 6):

   ```sql
   select public.award_year_of(year_group) as year, year_group as class, count(*)
   from public.students where active
   group by 1, 2 order by 1, 2;
   ```

3. Optional: list anyone still without a section. This should only show the odd exception, such as Reception:

   ```sql
   select student_id, full_name, year_group
   from public.students
   where active and year_group !~* '^\s*yr\s*[0-9]+\s*[a-z]\s*$'
   order by year_group, full_name;
   ```

The file is safe to run again.

4. Then run `supabase/migrations/20261007_award_staff_subjects.sql` (subjects per year group) `supabase/migrations/20261008_award_staff_roles.sql` (one person, several roles) `supabase/migrations/20261009_award_term_focus.sql` (Learner Profile focus per term) and `supabase/migrations/20261010_award_teacher_role.sql` (Tutor and Teacher roles) the same way, in that order. Each ends by showing **OK**.

## 2. Edge Functions

In the terminal, inside the project folder:

```bash
supabase functions deploy journey-award-staff --no-verify-jwt
supabase functions deploy journey-member-portfolio --no-verify-jwt
supabase functions deploy journey-directory --no-verify-jwt
```

- `journey-award-staff` is **new**. It adds staff from the *Staff & classes* screen: it creates their sign-in and a "Staff" account if they have none.
- `journey-member-portfolio` is **updated**. Portfolios opened from the landing page now include school awards.
- `journey-directory` is **updated**. Now that Year Group holds the class (`Yr6C`), the year filter on *Browse portfolios* lists each year with its classes under it, e.g. Year 6, then Yr6A–Yr6D. Choosing "Year 6" shows the whole year.

You can also use the dashboard: Edge Functions → Deploy a new function, then paste `index.ts`.

## 3. Website (Netlify)

Upload the contents of `dist` (or `student-portfolio-v33-dist.zip`) to Netlify, as before.

## 4. First run (as SuperAdmin)

1. **Lists & settings:** check the subjects, curriculum areas and Learner Profile attributes. Choose a **Year group** at the top to tick which subjects and areas that year offers; teachers only see those for the class they pick.
2. **Staff & classes:** **Import staff** from a CSV (full_name and email are enough; the template is downloadable there). Then tick people and use **Assign role** to give them a role and classes in bulk. One person can hold several roles, e.g. **Tutor** of Yr8A, **Teacher** of Science in Yr8A, Yr8B and Yr9C, *and* Head of Year 7 (in a CSV: one row per role, same email). A Teacher must have subjects. **Edit** on a person changes or removes their roles.
3. **Award setup:** create the awards. For Going for Gold, choose a **Learner Profile focus for each term** (e.g. Term 1: Inquirers). Set the options (e.g. Gold, or Prize / Certificate / Effort), terms, open and close dates, year groups, who can view / enter / edit / delete, the optional limit and whether it shows on the portfolio and CV. Then press **Publish award**.
4. Teachers use **Enter awards**: choose award, class, term and year. Awards given by subject or area (Going for Gold, Subject Awards) open as a grid: one column per subject offered in that year, names written vertically, with the number of awards under each. Teachers see every column but can change only their own subjects; **+** on a cell adds a comment. **Submit** saves. There is no approval step: awards appear straight away on the portfolio's Awards & Recognition section and on the CV as "Verified by The British School".
5. Heads of Year and the Key Stage Office can open the same class sheet to change or remove awards, as each award's Edit / Delete permissions allow. The teacher who entered an award can change it while the award is open.
6. **Award reports**: filter by award, year group, class, term and academic year, then pick a report:
   - **Overview**: totals, coverage, awards by award / subject / class, most recognised students, recent teacher comments.
   - **Class report**: pick a class card. One row per student, one column per award, class totals, and who is *not yet* recognised.
   - **Student report**: search by name. Shows the student's full award record across every year, with term focus and teacher comments.
   - **Subjects & areas**: a heat map of subjects and areas against classes, with Gold / Prize / Certificate / Effort counts.
   - **Coverage**: how many awards each student has, coverage per class, and the "not yet recognised" list.
   - **Export**: six Excel (CSV) downloads.

   **Generate report** prints any report, or saves it as a PDF, with a TBS header. No new SQL is needed for reports.

   Admission numbers are never shown or exported anywhere in the award pages. Students are identified by name and class.

## Who can do what

| Person | Sees |
|---|---|
| SuperAdmin | Everything, including Lists & settings |
| Admin | Award setup, Staff & classes, Enter awards, Reports |
| Key Stage Office | Enter, edit and remove awards and see Reports for their year groups (also after an award closes) |
| Head of Year | Enter awards and Reports for their year group, while an award is open |
| Tutor | Enter awards and Reports for their form class, in every subject (unless limited), while an award is open |
| Teacher | Enter awards and Reports for the classes they teach, **only in their own subjects**, while an award is open |
| Students / parents | Their own awards on the portfolio and CV |

The View / Enter / Edit / Delete tickboxes on each award narrow this further.


## Import from ManageBac (CAS)

1. Run `supabase/migrations/20261011_managebac_import.sql` in the SQL Editor (after 20261010). It ends with **OK** and a second column, `coaches_can_manage_students`:
   - `true`: coaches can import and publish for any student.
   - `false`: run `supabase/migrations/20261012_coach_journey_access.sql` too. It lets coaches add, import, edit and publish moments and photos for any student; what they save goes to TBS for verification, and only Admin / SuperAdmin verify.
2. Redeploy `journey-drive-upload` (it now stores PDFs as documents and refuses files over 50 MB).
3. Upload the new `dist` to Netlify.

How it works: on **Journey moments**, press **Import from ManageBac** and choose the student's “CAS Reflections · By Activity” PDF. The app reads it in the browser, lists every activity (activities already imported are skipped), and shows each one pre-filled with **Previous / Next**. Untick any to leave out, then **Save as drafts**. Drafts are private; **Finish & publish** opens the usual form at the step that still needs something (usually Organisation and photos).

Name check: if the name in the PDF doesn't match the student, students are stopped; staff, coaches and admins see a warning and can tick “import anyway”.

## Award comments and adding Panthers awards (v33)

Run `migrations/20261014_award_comment_lines.sql` once.

- **Award comments** (SuperAdmin and Coach, in the workspace): the lines shown under each award on the portfolio. Coach's Awards have a list per criterion (e.g. Effort, Improvement), matched to the award title; Player of the Month and Player of the Match have one list each; school award lines are SuperAdmin-only. Each award picks one line, so repeat awards read differently. A coach's own comment still shows as the quote. With no lines, the card shows a plain factual line.
- **Add Panthers award** (SuperAdmin and Coach): adds a Coach's Award (`student_rewards`) or Player of the Month (`players_of_month`) using only the required fields. Undo switches the award off. Player of the Match comes from match results.

## Publish to portfolio (v33)

Run `migrations/20261016_award_publish_portfolio.sql`, then redeploy `journey-member-portfolio`.

- Entering, submitting and reviewing school awards work as before. Staff see submitted awards straight away.
- An award appears on the student's portfolio (and CV) only after it is **published** on the *Publish to portfolio* page.
- Who can publish: Admin and SuperAdmin (all), Key Stage Office (their key-stage years), Head of Year (their year). Tutors and Teachers cannot.
- Students and parents never see unpublished awards (enforced in the database, not just the screen).
- Awards that were already approved before this migration are marked as published, so nothing disappears from portfolios. Use "On portfolios → Take off portfolio" to undo any.
