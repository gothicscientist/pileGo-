import { describe, expect, it } from 'vitest';
import { extensionReturnTo, extensionSetupUrl } from './extension-flow';

describe('extension setup return destinations', () => {
  it('preserves the listing, review step and anchor through the setup URL', () => {
    const destination = '/item/a1?tab=listings&crosslist=1#photos';
    const setup = new URL(extensionSetupUrl(destination), 'https://pilego.app');
    expect(setup.pathname).toBe('/extension');
    expect(extensionReturnTo(setup.searchParams.get('returnTo'))).toBe(destination);
  });

  it.each([null, '', 'https://example.com', '//example.com', '/\\example.com', '/\n/example.com', '/extension', '/extension/?returnTo=/out'])(
    'ignores unsafe or looping destinations: %s', value => {
      expect(extensionReturnTo(value)).toBeNull();
    },
  );

  it('keeps a direct install visit available without a destination', () => {
    expect(extensionSetupUrl('//example.com')).toBe('/extension');
    expect(extensionReturnTo('/settings#extension')).toBe('/settings#extension');
  });
});
