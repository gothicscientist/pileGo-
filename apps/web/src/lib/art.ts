// Real clothing photos for the sign-in page and empty states: cutouts with the
// background removed, and a few plain photos for polaroids. Sources are in
// CREDITS.md.

import anorak from '~/assets/closet/anorak.webp';
import bananaHoodie from '~/assets/closet/banana-hoodie.webp';
import beanie from '~/assets/closet/beanie.webp';
import blackDenim from '~/assets/closet/black-denim.webp';
import blackHoodie from '~/assets/closet/black-hoodie.webp';
import blackZip from '~/assets/closet/black-zip.webp';
import cabernetHoodie from '~/assets/closet/cabernet-hoodie.webp';
import camelBlazer from '~/assets/closet/camel-blazer.webp';
import cap from '~/assets/closet/cap.webp';
import clayHoodie from '~/assets/closet/clay-hoodie.webp';
import coffeeLongsleeve from '~/assets/closet/coffee-longsleeve.webp';
import creamCargos from '~/assets/closet/cream-cargos.webp';
import denimJacket from '~/assets/closet/denim-jacket.webp';
import espressoHoodie from '~/assets/closet/espresso-hoodie.webp';
import flannel from '~/assets/closet/flannel.webp';
import greyHoodie from '~/assets/closet/grey-hoodie.webp';
import greySweats from '~/assets/closet/grey-sweats.webp';
import lemonHoodie from '~/assets/closet/lemon-hoodie.webp';
import lilacHoodie from '~/assets/closet/lilac-hoodie.webp';
import meshShorts from '~/assets/closet/mesh-shorts.webp';
import mexico66Cream from '~/assets/closet/mexico66-cream.webp';
import mexico66Yellow from '~/assets/closet/mexico66-yellow.webp';
import navyBomber from '~/assets/closet/navy-bomber.webp';
import pineHoodie from '~/assets/closet/pine-hoodie.webp';
import rawSelvedge from '~/assets/closet/raw-selvedge.webp';
import rustBomber from '~/assets/closet/rust-bomber.webp';
import selvedgeJacket from '~/assets/closet/selvedge-jacket.webp';
import shroudSelvedge from '~/assets/closet/shroud-selvedge.webp';
import whiteTee from '~/assets/closet/white-tee.webp';
import bananaFitPhoto from '~/assets/photos/banana-fit.webp';
import cargoFitPhoto from '~/assets/photos/cargo-fit.webp';
import denimPairPhoto from '~/assets/photos/denim-pair.webp';
import greyFitPhoto from '~/assets/photos/grey-fit.webp';
import knitPhoto from '~/assets/photos/knit.webp';
import lilacFitPhoto from '~/assets/photos/lilac-fit.webp';
import pineFitPhoto from '~/assets/photos/pine-fit.webp';
import selvedgeFitPhoto from '~/assets/photos/selvedge-fit.webp';

export interface Cutout {
  src: string;
  /** What it is, in the words a seller would use. */
  name: string;
  /** Width over height of the trimmed image. */
  ratio: number;
}

export const CUTOUTS = {
  anorak: { src: anorak, name: 'Colour-block anorak', ratio: 0.81 },
  bananaHoodie: { src: bananaHoodie, name: 'Banana milk heavyweight hoodie', ratio: 0.82 },
  beanie: { src: beanie, name: 'Cable knit beanie', ratio: 0.75 },
  blackDenim: { src: blackDenim, name: 'Washed black baggy jeans', ratio: 0.56 },
  blackHoodie: { src: blackHoodie, name: 'Black heavyweight hoodie', ratio: 0.80 },
  blackZip: { src: blackZip, name: 'Black heavyweight zip-up', ratio: 0.70 },
  cabernetHoodie: { src: cabernetHoodie, name: 'Cabernet heavyweight hoodie', ratio: 0.82 },
  camelBlazer: { src: camelBlazer, name: 'Camel blazer', ratio: 0.41 },
  cap: { src: cap, name: 'Yellow cap', ratio: 1.55 },
  clayHoodie: { src: clayHoodie, name: 'Clay heavyweight hoodie', ratio: 0.81 },
  coffeeLongsleeve: { src: coffeeLongsleeve, name: 'Coffee long sleeve tee', ratio: 1.09 },
  creamCargos: { src: creamCargos, name: 'Cream flared cargos', ratio: 0.74 },
  denimJacket: { src: denimJacket, name: 'Cord collar denim jacket', ratio: 0.82 },
  espressoHoodie: { src: espressoHoodie, name: 'Espresso heavyweight hoodie', ratio: 0.82 },
  flannel: { src: flannel, name: 'Grey check flannel', ratio: 0.64 },
  greyHoodie: { src: greyHoodie, name: 'Heather grey heavyweight hoodie', ratio: 0.80 },
  greySweats: { src: greySweats, name: 'Grey baggy sweatpants', ratio: 0.69 },
  lemonHoodie: { src: lemonHoodie, name: 'Lemonade heavyweight hoodie', ratio: 0.82 },
  lilacHoodie: { src: lilacHoodie, name: 'Lilac heavyweight hoodie', ratio: 0.81 },
  meshShorts: { src: meshShorts, name: 'Carolina blue mesh shorts', ratio: 1.15 },
  mexico66Cream: { src: mexico66Cream, name: 'Onitsuka Tiger Mexico 66, cream', ratio: 2.48 },
  mexico66Yellow: { src: mexico66Yellow, name: 'Onitsuka Tiger Mexico 66, yellow', ratio: 2.41 },
  navyBomber: { src: navyBomber, name: 'Navy sherpa jacket', ratio: 0.75 },
  pineHoodie: { src: pineHoodie, name: 'Pine heavyweight hoodie', ratio: 0.82 },
  rawSelvedge: { src: rawSelvedge, name: 'Raw indigo selvedge jeans', ratio: 0.52 },
  rustBomber: { src: rustBomber, name: 'Rust bomber', ratio: 0.83 },
  selvedgeJacket: { src: selvedgeJacket, name: 'Selvedge denim jacket', ratio: 1.21 },
  shroudSelvedge: { src: shroudSelvedge, name: 'Washed selvedge jeans', ratio: 0.58 },
  whiteTee: { src: whiteTee, name: 'White tee', ratio: 0.62 },
} satisfies Record<string, Cutout>;

export type CutoutId = keyof typeof CUTOUTS;

export const PHOTOS = {
  bananaFit: { src: bananaFitPhoto, caption: 'Banana milk, baggy' },
  cargoFit: { src: cargoFitPhoto, caption: 'Cargos and a crewneck' },
  denimPair: { src: denimPairPhoto, caption: 'Denim, both halves' },
  greyFit: { src: greyFitPhoto, caption: 'Heather grey set' },
  knit: { src: knitPhoto, caption: 'Chunky knit' },
  lilacFit: { src: lilacFitPhoto, caption: 'Lilac heavyweight' },
  pineFit: { src: pineFitPhoto, caption: 'Pine hoodie' },
  selvedgeFit: { src: selvedgeFitPhoto, caption: 'Washed selvedge' },
} satisfies Record<string, { src: string; caption: string }>;
