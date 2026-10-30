// esbuild inlines these as data: URLs (see build.mjs).
declare module '*.png' {
  const url: string;
  export default url;
}
