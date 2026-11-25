# Admission dates: Excel → Supabase

The CV shows **At TBS since Apr 2022 · 4 yrs** from `students.admission_date`.
Run migration `20261005_cv_quotes_admission.sql` first (it adds the column).

## 1. Prepare the Excel

Keep just two columns, with these exact headers:

| student_id | admission_date |
|------------|----------------|
| ADM1671    | 2022-04-11     |
| ADM2797    | 2019-08-01     |

- `student_id` must match the admission number in the `students` table (e.g. `ADM1671`).
- Format the date column as **YYYY-MM-DD**: select the column → Format Cells → Custom → `yyyy-mm-dd`.
  This matters. A date like `04/11/2022` can be read as 11 April or 4 November.
- Save as **CSV (UTF-8)**.

## 2. Load the CSV into a holding table

In Supabase → **SQL Editor**, run:

```sql
create table if not exists public.admission_import (
  student_id     text,
  admission_date date
);
truncate public.admission_import;
```

Then **Table Editor** → `admission_import` → **Insert → Import data from CSV** → choose your file.

## 3. Check, then copy into students

```sql
-- Rows whose student_id is not in students (fix these in the Excel)
select i.* from public.admission_import i
left join public.students s on s.student_id = i.student_id
where s.student_id is null;

-- Copy the dates across
update public.students s
set admission_date = i.admission_date
from public.admission_import i
where s.student_id = i.student_id
  and i.admission_date is not null;

-- How many students now have a date
select count(*) filter (where admission_date is not null) as with_date,
       count(*) as total
from public.students where active;

-- Tidy up
drop table public.admission_import;
```

Re-running steps 2–3 with a newer Excel simply overwrites the dates.
New joiners can also be typed straight into `students.admission_date` in the Table Editor.
