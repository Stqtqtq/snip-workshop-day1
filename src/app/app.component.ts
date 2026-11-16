import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { LinksApiService, Link } from './links-api.service';

const httpUrlValidator: ValidatorFn = (control): ValidationErrors | null => {
  const value = String(control.value ?? '').trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
};

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { error?: unknown } | null;
    if (typeof body?.error === 'string') {
      return body.error;
    }
    if (error.status === 0) {
      return 'Could not reach the Snip API. Check that the backend is running at http://localhost:3000.';
    }
  }
  return fallback;
}

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private readonly api = inject(LinksApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly linkForm = new FormGroup({
    url: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, httpUrlValidator]
    })
  });
  readonly links = signal<Link[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal('');
  readonly submitError = signal('');
  readonly createdLink = signal<Link | null>(null);

  get urlControl(): FormControl<string> {
    return this.linkForm.controls.url;
  }

  constructor() {
    this.refreshLinks();
  }

  refreshLinks(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api.listLinks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: links => {
          this.links.set(links);
          this.loading.set(false);
        },
        error: error => {
          this.loadError.set(apiErrorMessage(error, 'Could not load links. Please try again.'));
          this.loading.set(false);
        }
      });
  }

  submit(): void {
    this.linkForm.markAllAsTouched();
    if (this.linkForm.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.submitError.set('');
    this.createdLink.set(null);
    this.api.createLink(this.urlControl.value.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: link => {
          this.saving.set(false);
          this.createdLink.set(link);
          this.linkForm.reset();
          this.refreshLinks();
        },
        error: error => {
          this.submitError.set(apiErrorMessage(error, 'Could not create the short link. Please try again.'));
          this.saving.set(false);
        }
      });
  }
}
