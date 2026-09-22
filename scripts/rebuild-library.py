#!/usr/bin/env python3
"""Rebuild a bounded public Deezer metadata index from verified artist IDs.

Usage: python3 scripts/rebuild-library.py --manifest data/catalog-manifest.json --output output/rebuilt-catalog
Only /artist/{id}/top is called. No genre endpoints, audio, account, or paid model.
"""
import argparse
import concurrent.futures
import datetime
import json
from pathlib import Path
import threading
import time
import urllib.error
import urllib.request


def utcnow():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=Path(__file__).resolve().parent.parent / "data/catalog-manifest.json")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent.parent / "output/rebuilt-catalog")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    args.output.mkdir(parents=True, exist_ok=True)
    artists = {str(a["id"]): a for a in manifest["artists"]}
    ids = list(dict.fromkeys(str(x) for x in manifest["collectArtistIds"]))
    if not all(x.isdigit() for x in ids):
        raise ValueError("Manifest artist IDs must be decimal Deezer IDs")
    limit = min(50, max(1, int(manifest.get("tracksPerArtist", 35))))
    request_cap = min(450, int(manifest.get("requestLimit", 450)))
    if len(ids) > request_cap:
        raise ValueError("Artist list exceeds the bounded request budget")
    started = utcnow()
    lock = threading.Lock()
    requests, errors, records, provenance = [], [], {}, {}
    request_count = 0

    def fetch(aid):
        nonlocal request_count
        url = f"https://api.deezer.com/artist/{aid}/top?limit={limit}"
        for attempt in range(1, 4):
            with lock:
                if request_count >= request_cap:
                    raise RuntimeError("Request budget exhausted")
                request_count += 1
                number = request_count
            entry = {"request": number, "artistId": aid, "url": url, "attempt": attempt, "at": utcnow()}
            retry_delay = 0
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "AftertoneCatalogRebuild/1.0", "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=25) as response:
                    entry["status"] = response.status
                    payload = json.load(response)
                if payload.get("error"):
                    entry["error"] = payload["error"]
                    if payload["error"].get("code") in (4, 429) and attempt < 3:
                        retry_delay = 5 * 2 ** (attempt - 1)
                    else:
                        raise ValueError(str(payload["error"]))
                if not retry_delay:
                    return payload.get("data", []), url, entry["at"]
            except urllib.error.HTTPError as error:
                entry.update(status=error.code, error=str(error))
                if error.code in (429, 503) and attempt < 3:
                    retry_after = error.headers.get("Retry-After", "")
                    retry_delay = min(45, float(retry_after) if retry_after.isdigit() else 5 * 2 ** (attempt - 1))
                else:
                    raise
            except (TimeoutError, urllib.error.URLError) as error:
                entry["error"] = str(error)
                if attempt == 1:
                    retry_delay = 3
                else:
                    raise
            finally:
                with lock:
                    requests.append(entry)
            if retry_delay:
                time.sleep(retry_delay)

    workers = min(3, max(1, int(manifest.get("concurrency", 3))))
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch, aid): aid for aid in ids}
        for done, future in enumerate(concurrent.futures.as_completed(futures), 1):
            requested_aid = futures[future]
            try:
                rows, url, collected_at = future.result()
                for row in rows:
                    artist, album = row.get("artist") or {}, row.get("album") or {}
                    image = album.get("cover_big") or album.get("cover_medium") or album.get("cover")
                    if not all([row.get("id"), row.get("title"), row.get("duration"), artist.get("id"), artist.get("name"), album.get("id"), album.get("title"), image]):
                        continue
                    tid, aid = str(row["id"]), str(artist["id"])
                    groups = set(artists.get(aid, {}).get("collectionGroups", []))
                    groups.update(artists.get(requested_aid, {}).get("collectionGroups", []))
                    if tid not in records:
                        records[tid] = {
                            "id": tid, "provider": "deezer", "title": row["title"],
                            "artist": artist["name"], "artistId": aid,
                            "album": album["title"], "albumId": str(album["id"]),
                            "image": image, "url": row.get("link") or f"https://www.deezer.com/track/{tid}",
                            "duration": int(row["duration"]), "artistGenres": [],
                            "previewAvailable": bool(row.get("preview")), "collectionGroups": sorted(groups),
                        }
                        if isinstance(row.get("rank"), (int, float)):
                            records[tid]["popularity"] = row["rank"]
                    else:
                        records[tid]["collectionGroups"] = sorted(set(records[tid]["collectionGroups"]) | groups)
                    evidence = provenance.setdefault(tid, {"firstCollectedAt": collected_at, "sources": [], "requestedArtistIds": []})
                    if url not in evidence["sources"]:
                        evidence["sources"].append(url)
                    if requested_aid not in evidence["requestedArtistIds"]:
                        evidence["requestedArtistIds"].append(requested_aid)
            except Exception as error:
                errors.append({"artistId": requested_aid, "error": str(error)})
            if done % 20 == 0 or done == len(ids):
                print(json.dumps({"completedArtists": done, "totalArtists": len(ids), "tracks": len(records), "requests": request_count}), flush=True)

    tracks = sorted(records.values(), key=lambda t: int(t["id"]))
    stats = {
        "collectedFrom": started, "collectedThrough": utcnow(), "totalRequests": request_count,
        "requestLimit": request_cap, "concurrency": workers, "totalTracks": len(tracks),
        "uniquePrimaryArtists": len({t["artistId"] for t in tracks}),
        "uniqueAlbums": len({t["albumId"] for t in tracks}), "errors": errors,
        "collectionGroupsMeaning": manifest["collectionGroupsMeaning"],
        "excludedPaths": manifest["excludedPaths"], "limitations": manifest["limitations"],
        "catalogCanChange": True,
    }
    for name, value in [("tracks.json", tracks), ("stats.json", stats), ("track-provenance.json", provenance), ("request-log.json", sorted(requests, key=lambda x: x["request"]))]:
        (args.output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(stats, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
