DO $$
DECLARE
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT
            p.proname AS name,
            pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
            'handle_new_user',
            'handle_work_order_status_change',
            'has_permission',
            'is_approved_user',
            'release_work_order_item_materials',
            'release_work_order_reservations',
            'reserve_work_order_item_materials',
            'rls_auto_enable',
            'sync_item_stock_from_batches',
            'sync_user_permission_claim',
            'sync_work_order_item_reservations',
            'approve_user',
            'complete_work_order',
            'create_work_order_with_items',
            'current_profile_staff_level_id',
            'delete_item_if_unreferenced',
            'set_work_order_item_batch_allocations'
          )
    LOOP
        -- Always make these safe
        EXECUTE format(
            'ALTER FUNCTION public.%I(%s) SECURITY INVOKER;',
            fn.name, fn.args
        );

        -- Never expose via PUBLIC
        EXECUTE format(
            'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC;',
            fn.name, fn.args
        );

        -- Base RPC access: API + backend
        EXECUTE format(
            'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticator, service_role;',
            fn.name, fn.args
        );

        -- Extra grants for functions used in RLS / permission checks
        IF fn.name IN ('is_approved_user', 'has_permission', 'current_profile_staff_level_id', 'sync_user_permission_claim') THEN
            EXECUTE format(
                'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, anon;',
                fn.name, fn.args
            );
        END IF;
    END LOOP;
END $$;
