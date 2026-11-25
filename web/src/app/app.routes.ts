import { Routes } from '@angular/router';
import { AccountComponent } from './core/account/account';
import { AuthComponent } from './core/auth/auth';
import { ProductionLogComponent } from './components/production-log/production-log';
import { WorkOrderListComponent } from './components/work-order-list/work-order-list';
import { WorkOrderComponent } from './components/work-order/work-order';
import { ItemListComponent } from './components/item-list/item-list';
import { ItemComponent } from './components/item/item';
import { UserListComponent } from './components/user-list/user-list';
import { CategoryListComponent } from './components/category-list/category-list';
import { CategoryComponent } from './components/category/category';
import { CustomerListComponent } from './components/customer-list/customer-list';
import { CustomerComponent } from './components/customer/customer';
import { DispatchListComponent } from './components/dispatch-list/dispatch-list';
import { DispatchComponent } from './components/dispatch/dispatch';
import { authGuard } from './core/auth/auth.guard';
import { adminGuard, permissionGuard } from './core/auth/admin.guard';
import { Dashboard } from './components/dashboard/dashboard';

export const routes: Routes = [
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    { path: 'login', component: AuthComponent },
    { 
        path: '',
        canActivate: [authGuard],
        children: [
            { path: 'account', component: AccountComponent, canActivate: [authGuard] },
            { path: 'work-orders', component: WorkOrderListComponent, canActivate: [authGuard] },
            { path: 'work-orders/new', component: WorkOrderComponent, canActivate: [permissionGuard(['admin', 'supervisor'])] },
            { path: 'work-orders/:id', component: WorkOrderComponent, canActivate: [permissionGuard(['admin', 'supervisor', 'staff'])] },
            { path: 'items', component: ItemListComponent, canActivate: [authGuard] },
            { path: 'items/new', component: ItemComponent, canActivate: [permissionGuard(['admin'])] },
            { path: 'items/:id', component: ItemComponent, canActivate: [permissionGuard(['admin'])] },
            { path: 'categories', component: CategoryListComponent, canActivate: [adminGuard] },
            { path: 'categories/new', component: CategoryComponent, canActivate: [adminGuard] },
            { path: 'categories/:id', component: CategoryComponent, canActivate: [adminGuard] },
            { path: 'customers', component: CustomerListComponent, canActivate: [authGuard] },
            { path: 'customers/new', component: CustomerComponent, canActivate: [permissionGuard(['admin', 'supervisor', 'staff'])] },
            { path: 'customers/:id', component: CustomerComponent, canActivate: [permissionGuard(['admin', 'supervisor', 'staff'])] },
            { path: 'dispatches', component: DispatchListComponent, canActivate: [authGuard] },
            { path: 'dispatches/new', component: DispatchComponent, canActivate: [permissionGuard(['admin', 'supervisor', 'staff'])] },
            { path: 'dispatches/:id', component: DispatchComponent, canActivate: [authGuard] },
            { path: 'production-log', component: ProductionLogComponent, canActivate: [authGuard] },
            { path: 'users', component: UserListComponent, canActivate: [adminGuard] },
            { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
        ]
    }
];
