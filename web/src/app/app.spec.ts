import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { SupabaseService } from './services/supabase';

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
});
