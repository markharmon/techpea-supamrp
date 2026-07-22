import { Routes } from '@angular/router';
import { AccountComponent } from './core/account/account';
import { AuthComponent } from './core/auth/auth';
import { ProductionLogComponent } from './components/production-log/production-log';
import { WorkOrderListComponent } from './components/work-order-list/work-order-list';
import { WorkOrderComponent } from './components/work-order/work-order';
import { ItemListComponent } from './components/item-list/item-list';
import { ItemComponent } from './components/item/item';
import { UserListComponent } from './components/user-list/user-list';
import { authGuard } from './core/auth/auth.guard';
import { Dashboard } from './components/dashboard/dashboard';

export const routes: Routes = [
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    { path: 'login', component: AuthComponent },
    { 
        path: '',
        canActivate: [authGuard],
        children: [
            { path: 'account', component: AccountComponent },
            { path: 'work-orders', component: WorkOrderListComponent },
            { path: 'work-orders/new', component: WorkOrderComponent },
            { path: 'work-orders/:id', component: WorkOrderComponent },
            { path: 'items', component: ItemListComponent },
            { path: 'items/new', component: ItemComponent },
            { path: 'items/:id', component: ItemComponent },
            { path: 'production-log', component: ProductionLogComponent },
            { path: 'users', component: UserListComponent },
            { path: 'dashboard', component: Dashboard},
        ]
    }
];

