#!/usr/bin/env bash
# usage: fetch_thumbs.sh list.tsv outdir [width]
# list.tsv lines:  <unsplash short id>\t<photo-... path>   (Unsplash)
#              or  px<pexels id>\t-                        (Pexels)
set -u
list=$1; out=$2; w=${3:-360}
mkdir -p "$out"
while IFS=$'\t' read -r id path; do
  [ -z "$id" ] && continue
  f="$out/$id.jpg"
  [ -s "$f" ] && continue
  if [[ $id == px* ]]; then n=${id#px}
    url="https://images.pexels.com/photos/$n/pexels-photo-$n.jpeg?auto=compress&w=$w"
  else url="https://images.unsplash.com/$path?w=$w&q=70&fm=jpg"; fi
  curl -sS -m 90 -f -o "$f" "$url" || echo "fail $id"
done < "$list"
