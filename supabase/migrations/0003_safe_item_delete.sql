-- Safe item deletion that blocks removal when references exist.
create or replace function public.delete_item_if_unreferenced(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_item_exists boolean;
    v_bom_parent_refs bigint;
    v_bom_child_refs bigint;
    v_work_order_refs bigint;
begin
    if not public.has_permission(array['admin', 'supervisor', 'staff']) then
        raise exception 'Insufficient permissions to delete items';
    end if;

    select exists(select 1 from public.items i where i.id = p_item_id)
    into v_item_exists;

    if not v_item_exists then
        raise exception 'Item not found';
    end if;

    select count(*) into v_bom_parent_refs
    from public.bom
    where parent_item_id = p_item_id;

    select count(*) into v_bom_child_refs
    from public.bom
    where child_item_id = p_item_id;

    select count(*) into v_work_order_refs
    from public.work_order_items
    where item_id = p_item_id;

    if v_bom_parent_refs > 0 or v_bom_child_refs > 0 or v_work_order_refs > 0 then
        raise exception using
            errcode = '23503',
            message = 'Cannot delete item because it is still referenced',
            detail = format(
                'bom_parent_refs=%s, bom_child_refs=%s, work_order_refs=%s',
                v_bom_parent_refs,
                v_bom_child_refs,
                v_work_order_refs
            );
    end if;

    delete from public.items
    where id = p_item_id;
end;
$$;

revoke all on function public.delete_item_if_unreferenced(uuid) from public;
grant execute on function public.delete_item_if_unreferenced(uuid) to authenticated;
