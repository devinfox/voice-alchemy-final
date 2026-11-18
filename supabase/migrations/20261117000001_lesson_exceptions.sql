-- One-off changes to a weekly lesson: cancel a single date, or move it to
-- another date/time. The weekly slot itself stays on public.bookings.

create table if not exists public.lesson_exceptions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  -- The date the lesson would normally have happened.
  original_date date not null,
  kind text not null check (kind in ('cancelled', 'rescheduled')),
  -- Only for kind = 'rescheduled'.
  new_date date,
  new_time time,
  new_duration_minutes integer check (new_duration_minutes between 15 and 180),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, original_date),
  check (kind = 'cancelled' or (new_date is not null and new_time is not null))
);

create index if not exists idx_lesson_exceptions_booking on public.lesson_exceptions (booking_id);
create index if not exists idx_lesson_exceptions_new_date on public.lesson_exceptions (new_date);

alter table public.lesson_exceptions enable row level security;

-- Teacher and student of the lesson (and admins) can see changes.
drop policy if exists lesson_exceptions_select on public.lesson_exceptions;
create policy lesson_exceptions_select on public.lesson_exceptions for select using (
  exists (
    select 1 from public.bookings b
    where b.id = lesson_exceptions.booking_id
      and (b.student_id = auth.uid() or b.instructor_id = auth.uid())
  )
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Only the lesson's teacher (or an admin) can make changes.
drop policy if exists lesson_exceptions_write on public.lesson_exceptions;
create policy lesson_exceptions_write on public.lesson_exceptions for all using (
  exists (
    select 1 from public.bookings b
    where b.id = lesson_exceptions.booking_id and b.instructor_id = auth.uid()
  )
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
) with check (
  exists (
    select 1 from public.bookings b
    where b.id = lesson_exceptions.booking_id and b.instructor_id = auth.uid()
  )
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

grant select, insert, update, delete on public.lesson_exceptions to authenticated;
grant all on public.lesson_exceptions to service_role;
