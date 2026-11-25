-- 0017 switched these functions to SECURITY INVOKER and removed access from
-- authenticated, which breaks work order/batch creation (permission denied for
-- function reserve_work_order_item_materials). Restore definer semantics.
do $$
declare
    fn record;
begin
    for fn in
        select p.proname as name, pg_get_function_identity_arguments(p.oid) as args
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (
            'handle_work_order_status_change',
            'release_work_order_item_materials',
            'release_work_order_reservations',
            'reserve_work_order_item_materials',
            'sync_item_stock_from_batches',
            'sync_work_order_item_reservations',
            'approve_user',
            'complete_work_order',
            'create_work_order_with_items',
            'delete_item_if_unreferenced',
            'set_work_order_item_batch_allocations'
          )
    loop
        execute format('alter function public.%I(%s) security definer set search_path = public;', fn.name, fn.args);
        execute format('revoke execute on function public.%I(%s) from public;', fn.name, fn.args);
        execute format('grant execute on function public.%I(%s) to authenticated, service_role;', fn.name, fn.args);
    end loop;
end $$;
