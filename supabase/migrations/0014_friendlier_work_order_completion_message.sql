-- Replace the raw "use complete_work_order()" error with user-facing guidance.
create or replace function public.handle_work_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if old.status = 'completed' and new.status is distinct from old.status then
        raise exception 'Completed work orders cannot change status';
    end if;

    if new.status = 'completed'
       and current_setting('app.complete_work_order', true) is distinct from 'true' then
        raise exception 'Add a production log to complete this work order';
    end if;

    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
        perform public.release_work_order_reservations(old.id);
    end if;

    return new;
end;
$$;
