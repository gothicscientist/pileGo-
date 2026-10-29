// Real clothing photos for the sign-in page and empty states: cutouts with the
// background removed, and a few plain photos for polaroids. Sources and
// licences are in CREDITS.md.

import anorak from '~/assets/closet/anorak.webp';
import beanie from '~/assets/closet/beanie.webp';
import camelBlazer from '~/assets/closet/camel-blazer.webp';
import cap from '~/assets/closet/cap.webp';
import darkJeans from '~/assets/closet/dark-jeans.webp';
import denimJacket from '~/assets/closet/denim-jacket.webp';
import flannel from '~/assets/closet/flannel.webp';
import lightJeans from '~/assets/closet/light-jeans.webp';
import longsleeve from '~/assets/closet/longsleeve.webp';
import navyBomber from '~/assets/closet/navy-bomber.webp';
import rustBomber from '~/assets/closet/rust-bomber.webp';
import sweatshirt from '~/assets/closet/sweatshirt.webp';
import whiteHoodie from '~/assets/closet/white-hoodie.webp';
import whiteTee from '~/assets/closet/white-tee.webp';
import yellowHoodie from '~/assets/closet/yellow-hoodie.webp';
import denimPair from '~/assets/photos/denim-pair.webp';
import greyHoodie from '~/assets/photos/grey-hoodie.webp';
import hangingHoodie from '~/assets/photos/hanging-hoodie.webp';
import knit from '~/assets/photos/knit.webp';
import navyHoodie from '~/assets/photos/navy-hoodie.webp';
import tanHoodie from '~/assets/photos/tan-hoodie.webp';

export interface Cutout {
  src: string;
  /** What it is, in the words a seller would use. */
  name: string;
  /** Width over height of the trimmed image. */
  ratio: number;
}

export const CUTOUTS = {
  anorak: { src: anorak, name: 'Colour-block anorak', ratio: 0.81 },
  beanie: { src: beanie, name: 'Cable knit beanie', ratio: 0.75 },
  camelBlazer: { src: camelBlazer, name: 'Camel blazer', ratio: 0.41 },
  cap: { src: cap, name: 'Yellow cap', ratio: 1.55 },
  darkJeans: { src: darkJeans, name: 'Dark wash jeans', ratio: 0.3 },
  denimJacket: { src: denimJacket, name: 'Cord collar denim jacket', ratio: 0.82 },
  flannel: { src: flannel, name: 'Grey check flannel', ratio: 0.64 },
  lightJeans: { src: lightJeans, name: 'Baggy light jeans', ratio: 0.7 },
  longsleeve: { src: longsleeve, name: 'Black long sleeve', ratio: 0.56 },
  navyBomber: { src: navyBomber, name: 'Navy sherpa jacket', ratio: 0.75 },
  rustBomber: { src: rustBomber, name: 'Rust bomber', ratio: 0.83 },
  sweatshirt: { src: sweatshirt, name: 'Plain white crewneck', ratio: 1.12 },
  whiteHoodie: { src: whiteHoodie, name: 'Plain white hoodie', ratio: 0.7 },
  whiteTee: { src: whiteTee, name: 'White tee', ratio: 0.62 },
  yellowHoodie: { src: yellowHoodie, name: 'Yellow hoodie', ratio: 0.77 },
} satisfies Record<string, Cutout>;

export type CutoutId = keyof typeof CUTOUTS;

export const PHOTOS = {
  denimPair: { src: denimPair, caption: 'Denim, both halves' },
  greyHoodie: { src: greyHoodie, caption: 'Graphic hoodie' },
  hangingHoodie: { src: hangingHoodie, caption: 'Plain hoodie' },
  knit: { src: knit, caption: 'Chunky knit' },
  navyHoodie: { src: navyHoodie, caption: 'Weekend fit' },
  tanHoodie: { src: tanHoodie, caption: 'Cropped hoodie' },
} satisfies Record<string, { src: string; caption: string }>;
