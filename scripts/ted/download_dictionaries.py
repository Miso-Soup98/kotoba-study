"""Download only public Kaikki dictionary assets, sequentially and resumably."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import time
import urllib.request

BASE = Path(__file__).resolve().parents[2] / "private-content" / "ted" / "dictionaries"
SOURCES = [
    ("kaikki-ja-simplified", "%E6%97%A5%E8%AF%AD"),
    ("kaikki-ja-traditional", "%E6%97%A5%E8%AA%9E"),
]
NOTICES = [
    ("SudachiDict-LEGAL.txt", "https://raw.githubusercontent.com/WorksApplications/SudachiDict/develop/LEGAL"),
    ("Apache-2.0.txt", "https://raw.githubusercontent.com/WorksApplications/SudachiDict/develop/LICENSE-2.0.txt"),
    ("SudachiPy-LICENSE.txt", "https://raw.githubusercontent.com/WorksApplications/SudachiPy/develop/LICENSE"),
    ("CC-BY-SA-4.0.txt", "https://raw.githubusercontent.com/spdx/license-list-data/main/text/CC-BY-SA-4.0.txt"),
]


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_notices():
    directory = BASE / "licenses"
    directory.mkdir(parents=True, exist_ok=True)
    manifest = []
    for name, url in NOTICES:
        dest = directory / name
        if not dest.exists():
            with urllib.request.urlopen(url, timeout=30) as response:
                text = response.read(200001)
            if len(text) > 200000:
                raise RuntimeError("Unexpected license document size")
            dest.write_bytes(text)
        manifest.append({"file": name, "url": url, "bytes": dest.stat().st_size, "sha256": file_hash(dest)})
    (directory / "sources.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def download(label, segment):
    url = f"https://kaikki.org/zhwiktionary/{segment}/kaikki.org-dictionary-{segment}.jsonl"
    dest = BASE / (label + ".jsonl")
    partial = BASE / (label + ".jsonl.partial")
    manifest_path = BASE / "download-manifest.json"
    cache_manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []
    cached = next((row for row in cache_manifest if row.get("file") == dest.name), None)
    if dest.exists() and cached:
        if file_hash(dest) != cached.get("sha256"):
            raise RuntimeError(f"Cached dictionary checksum mismatch: {dest.name}")
        print(f"{label}: verified cached snapshot", flush=True)
        return cached
    with urllib.request.urlopen(urllib.request.Request(url, headers={"Range": "bytes=0-0", "Accept-Encoding": "identity"}), timeout=30) as response:
        total = int(response.headers["Content-Range"].split("/")[-1])
        etag = response.headers.get("ETag", "")
    identity = BASE / (label + ".partial-identity.json")
    previous_identity = json.loads(identity.read_text()) if identity.exists() else {}
    trusted_complete = dest.exists() and dest.stat().st_size == total and previous_identity.get("etag") == etag
    if not trusted_complete:
        # An incomplete download from an older run is safe to resume only when
        # accompanied by the same server ETag; otherwise begin anew.
        offset = partial.stat().st_size if partial.exists() and previous_identity.get("etag") == etag else 0
        identity.write_text(json.dumps({"etag": etag, "bytes": total, "url": url}), encoding="utf-8")
        with partial.open("r+b" if partial.exists() else "w+b") as output:
            output.truncate(offset)
            output.seek(offset)
            while offset < total:
                end = min(total - 1, offset + 1024 * 1024 - 1)
                for attempt in range(3):
                    try:
                        request = urllib.request.Request(url, headers={"Range": f"bytes={offset}-{end}", "If-Range": etag, "Accept-Encoding": "identity"})
                        with urllib.request.urlopen(request, timeout=30) as response:
                            if response.status != 206 or response.headers.get("ETag") != etag:
                                raise RuntimeError("Dictionary changed or server ignored byte range")
                            data = response.read(end - offset + 1)
                            if len(data) != end - offset + 1:
                                raise RuntimeError("Incomplete dictionary range")
                        output.write(data)
                        output.flush()
                        offset += len(data)
                        print(f"{label}: {offset}/{total} bytes", flush=True)
                        break
                    except Exception:
                        if attempt == 2:
                            raise
                        time.sleep(attempt + 1)
        partial.replace(dest)
    digest, count = hashlib.sha256(), 0
    with dest.open("rb") as source:
        for line in source:
            digest.update(line)
            if json.loads(line).get("lang_code") != "ja":
                raise ValueError("Non-Japanese record in dictionary")
            count += 1
    return {"file": dest.name, "url": url, "bytes": dest.stat().st_size, "sha256": digest.hexdigest(), "records": count, "etag": etag, "fetchedAt": datetime.now(timezone.utc).isoformat(), "license": "CC-BY-SA-4.0", "source": "Chinese Wiktionary contributors, extracted by Kaikki/Wiktextract"}


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    BASE.mkdir(parents=True, exist_ok=True)
    download_notices()
    manifest_path = BASE / "download-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []
    for label, segment in SOURCES:
        row = download(label, segment)
        manifest = [item for item in manifest if item["file"] != row["file"]] + [row]
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False), flush=True)
