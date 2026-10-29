import { Link } from 'react-router';
import { CutoutPiece, LooseTag } from '~/components/Scrapbook';

export function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-5 py-16 sm:flex-row sm:items-center sm:gap-10">
      <div className="relative h-52 w-44 shrink-0">
        <CutoutPiece id="whiteTee" at={{ x: '4%', y: '0%', w: '84%', r: -10, phone: true }} />
        <LooseTag price="?" note="Not here" className="right-0 bottom-0 z-10 scale-75" />
      </div>
      <div className="flex flex-col items-start gap-4">
        <p className="label-caps">404 / Lost property</p>
        <h1 className="font-display text-4xl">Nothing on this hanger.</h1>
        <p className="text-ink-2">The page or item may have been deleted.</p>
        <Link to="/closet" className="btn btn-ink">
          Back to your closet
        </Link>
      </div>
    </div>
  );
}
