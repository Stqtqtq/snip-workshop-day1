import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { Link } from './links-api.service';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let http: HttpTestingController;

  const endpoint = 'http://localhost:3000/api/links';
  const exampleLink: Link = {
    code: 'a1B2c3',
    url: 'https://example.com/a-long-page',
    shortUrl: 'http://localhost:3000/a1B2c3',
    hits: 0,
    createdAt: '2026-01-01T00:00:00.000Z'
  };

  function createComponent(): void {
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne(endpoint).flush([]);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('rejects non-http URLs without making a create request', () => {
    createComponent();
    component.urlControl.setValue('javascript:alert(1)');

    expect(component.urlControl.invalid).toBeTrue();
    component.submit();

    expect(component.saving()).toBeFalse();
    http.expectNone(endpoint);
  });

  it('creates a link, prevents duplicate submissions, and refreshes the list', () => {
    createComponent();
    component.urlControl.setValue('https://example.com/a-long-page');
    component.submit();

    const createRequest = http.expectOne(endpoint);
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body).toEqual({ url: exampleLink.url });

    component.submit();
    expect(component.saving()).toBeTrue();
    http.expectNone(endpoint);

    createRequest.flush(exampleLink, { status: 201, statusText: 'Created' });
    const refreshRequest = http.expectOne(endpoint);
    expect(refreshRequest.request.method).toBe('GET');
    refreshRequest.flush([exampleLink]);

    expect(component.createdLink()).toEqual(exampleLink);
    expect(component.links()).toEqual([exampleLink]);
    expect(component.saving()).toBeFalse();
  });

  it('shows the server error beside the form after an API failure', () => {
    createComponent();
    component.urlControl.setValue('https://example.com/a-long-page');
    component.submit();

    http.expectOne(endpoint).flush(
      { error: 'URL is invalid' },
      { status: 400, statusText: 'Bad Request' }
    );
    fixture.detectChanges();

    expect(component.submitError()).toBe('URL is invalid');
    expect(fixture.nativeElement.textContent).toContain('URL is invalid');
    expect(component.saving()).toBeFalse();
  });
});
