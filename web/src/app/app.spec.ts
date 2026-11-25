import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { SupabaseService } from './services/supabase';
import { MainMenuService } from './services/main-menu.service';

let authChangesCallCount = 0;

const supabaseMock = {
  authChanges: (callback: any) => {
    authChangesCallCount += 1;
    callback('SIGNED_IN', { user: { id: 'test-user' } });
    return { data: { subscription: { unsubscribe: () => undefined } } };
  },
  user: () => ({
    id: 'test-user',
    app_metadata: { permission: 'admin' },
  }),
};

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: SupabaseService,
          useValue: supabaseMock,
        },
      ],
    }).compileComponents();

    authChangesCallCount = 0;
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should subscribe to auth changes on init', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(authChangesCallCount).toBeGreaterThan(0);
  });

  it('should link to customers and dispatches from the main menu and close it on selection', () => {
    const fixture = TestBed.createComponent(App);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const menu = TestBed.inject(MainMenuService);
    menu.open();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const link = element.querySelector<HTMLAnchorElement>('a[href="/customers"]');
    expect(link?.textContent).toBe('Customers');
    link?.click();
    expect(menu.isOpen()).toBe(false);
    menu.open();
    fixture.detectChanges();
    const dispatchLink = element.querySelector<HTMLAnchorElement>('a[href="/dispatches"]');
    expect(dispatchLink?.textContent).toBe('Dispatches');
    dispatchLink?.click();
    expect(menu.isOpen()).toBe(false);
    navigate.mockRestore();
  });
});
