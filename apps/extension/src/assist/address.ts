// The seller's own address from pileGo's setup, shaped for sites that need it
// once: a site without a saved ship-from or return address gets this one
// added to the seller's account before the listing goes up.

import { cleanSellerAddress, type SellerAddress } from '@pilego/core';

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

export interface AddressParts extends SellerAddress {
  first_name: string;
  last_name: string;
  /** Two-letter code where there is one (CA), else as typed. */
  state_code: string;
  /** Full name where there is one (California), else as typed. */
  state_name: string;
}

/** The setup address, checked, with the name and state split the ways forms ask for them; null when there is none. */
export function addressParts(raw: SellerAddress | null | undefined): AddressParts | null {
  let address: SellerAddress | null;
  try {
    address = cleanSellerAddress(raw);
  } catch {
    return null;
  }
  if (!address) return null;
  const names = address.full_name.split(/\s+/);
  const state = address.state.trim();
  const upper = state.toUpperCase();
  const code = US_STATES[upper] ? upper : (Object.entries(US_STATES).find(([, name]) => name.toLowerCase() === state.toLowerCase())?.[0] ?? state);
  return {
    ...address,
    first_name: names.length > 1 ? names.slice(0, -1).join(' ') : names[0]!,
    last_name: names.length > 1 ? names.at(-1)! : '',
    state_code: code,
    state_name: US_STATES[code] ?? state,
  };
}
