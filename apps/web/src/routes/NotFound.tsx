import { Link } from 'react-router';
import { Garment } from '~/components/Garments';

export function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-4 px-5 py-16">
      <Garment kind="tee" fill="var(--sticker)" className="w-28 -rotate-12 cutout-shadow" />
      <h1 className="font-display text-4xl font-extrabold">Nothing on this hanger.</h1>
      <p className="text-ink-2">The page or item may have been deleted.</p>
      <Link to="/closet" className="btn btn-ink">
        Back to your closet
      </Link>
    </div>
  );
}
