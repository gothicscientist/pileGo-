// Keep setup a detour from the task that asked for the extension.

/** Only return to app pages, never an external URL or the setup page itself. */
export function extensionReturnTo(value: string | null): string | null {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return null;
  const url = new URL(value, 'https://pilego.invalid');
  if (url.origin !== 'https://pilego.invalid' || /^\/extension\/?$/.test(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function extensionSetupUrl(returnTo: string): string {
  const target = extensionReturnTo(returnTo);
  return target ? `/extension?${new URLSearchParams({ returnTo: target })}` : '/extension';
}
