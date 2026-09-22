-- Distinguish a self-test notification from a real cooking timer, so the dispatcher can title it
-- correctly instead of prefixing everything with the timer emoji.
alter table public.timer_reminders
  add column if not exists kind text not null default 'timer';

alter table public.timer_reminders
  drop constraint if exists timer_reminders_kind_check;

alter table public.timer_reminders
  add constraint timer_reminders_kind_check check (kind in ('timer', 'test'));
