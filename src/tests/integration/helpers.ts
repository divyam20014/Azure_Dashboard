import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

export type User = ReturnType<typeof userEvent.setup>;

export async function uploadFile(user: User, file: File) {
  await user.upload(screen.getByTestId('file-input'), file);
  await screen.findByRole('heading', { name: /Confirm data mapping/ }, { timeout: 10000 });
}

export async function generateDashboard(user: User) {
  await user.click(screen.getByRole('button', { name: /Generate dashboard/ }));
  await screen.findByTestId('kpi-total', undefined, { timeout: 10000 });
}

export function kpiCount(key: string): string {
  return screen.getByTestId(`kpi-${key}-count`).textContent ?? '';
}

/** Capture blobs passed to URL.createObjectURL so exports can be inspected. */
export function captureDownloads() {
  const blobs: Blob[] = [];
  const names: string[] = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
    blobs.push(b as Blob);
    return `blob:mock/${blobs.length}`;
  });
  URL.revokeObjectURL = vi.fn();
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download);
  });
  return {
    blobs,
    names,
    restore() {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      click.mockRestore();
    },
  };
}

export function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/** Expands a collapsible dashboard section by title, if it is currently collapsed. */
export async function expandSection(user: User, title: string) {
  const btn = screen.queryByRole('button', { name: `Expand ${title}` });
  if (btn) await user.click(btn);
}

export async function clearData(user: User) {
  await user.click(screen.getByRole('button', { name: /Clear Data/ }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Clear Data' }));
  await waitFor(() => expect(screen.getByTestId('privacy-statement')).toBeInTheDocument());
}
