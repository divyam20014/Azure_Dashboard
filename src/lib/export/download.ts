/**
 * Save a Blob generated in the browser to the user's device. Nothing is sent
 * over the network: the object URL points at memory and is revoked afterwards.
 * Only called from explicit user actions (button clicks).
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function textBlob(text: string): Blob {
  return new Blob([text], { type: 'text/plain;charset=utf-8' });
}
