import { test } from "node:test";
import assert from "node:assert/strict";
import { getListeningLinks } from "../lib/listening-links.ts";

const track = {
  id: "123", provider: "deezer", title: "Weird Fishes", artist: "Radiohead",
  url: "https://www.deezer.com/en/track/123?utm_source=aftertone",
};

test("keeps the exact source URL first and labels other destinations as searches", () => {
  const links = getListeningLinks(track);
  assert.deepEqual(links[0], { id: "deezer", label: "Deezer", url: track.url, kind: "track" });
  assert.equal(links.length, 6);
  assert.ok(links.slice(1).every((link) => link.kind === "search"));
  assert.deepEqual(links.slice(1).map((link) => link.id), ["spotify", "apple-music", "netease", "qq-music", "youtube-music"]);
});

test("Apple Music source preserves the storefront and exact track selection without duplication", () => {
  const url = "https://music.apple.com/sg/album/in-rainbows/456?i=123&uo=4";
  const links = getListeningLinks({ ...track, provider: "itunes", country: "SG", url });
  assert.deepEqual(links[0], { id: "apple-music", label: "Apple Music", url, kind: "track" });
  assert.equal(links.filter((link) => link.id === "apple-music").length, 1);
  assert.ok(links.slice(1).every((link) => link.kind === "search"));
});

test("accepts official song routes and legacy iTunes track selections", () => {
  for (const url of [
    "https://music.apple.com/gb/song/weird-fishes/123",
    "https://music.apple.com/us/song/123",
    "https://itunes.apple.com/us/album/in-rainbows/id456?i=123",
    "https://itunes.apple.com/WebObjects/MZStore.woa/wa/viewAlbum?id=456&i=123",
  ]) {
    assert.equal(getListeningLinks({ ...track, provider: "itunes", url })[0].kind, "track", url);
  }
});

test("all search destinations safely encode Chinese and URL punctuation on fixed official hosts", () => {
  const title = "  奇妙 & ? # / %  ";
  const artist = " 歌手 / other.example ";
  const query = encodeURIComponent(`${title.trim()} ${artist.trim()}`);
  const links = getListeningLinks({ ...track, title, artist, url: "" });
  const expected = {
    deezer: `https://www.deezer.com/search/${query}`,
    spotify: `https://open.spotify.com/search/${query}`,
    "apple-music": `https://music.apple.com/us/search?term=${query}`,
    netease: `https://music.163.com/#/search/m/?s=${query}&type=1`,
    "qq-music": `https://y.qq.com/n/ryqq/search?w=${query}&t=song`,
    "youtube-music": `https://music.youtube.com/search?q=${query}`,
  };
  for (const link of links) {
    assert.equal(link.url, expected[link.id]);
    assert.equal(link.kind, "search");
    assert.equal(new URL(link.url).protocol, "https:");
  }
});

test("unsafe or off-platform source URLs fall back to official search", () => {
  for (const url of [
    "http://www.deezer.com/track/123", "javascript:alert(1)",
    "https://www.deezer.com.evil.example/track/123", "https://evil.example/track/123",
    "https://www.deezer.com@evil.example/track/123", "https://user:pass@www.deezer.com/track/123",
    "https://www.deezer.com:444/track/123", "https://www.deezer.com/track/1\n23",
    "//www.deezer.com/track/123", "not a URL",
  ]) {
    const first = getListeningLinks({ ...track, url })[0];
    assert.equal(first.kind, "search", url);
    assert.equal(first.url, "https://www.deezer.com/search/Weird%20Fishes%20Radiohead", url);
  }
});

test("only the matching recording can be described as a direct link", () => {
  for (const [provider, url] of [
    ["deezer", "https://www.deezer.com/album/123"],
    ["deezer", "https://www.deezer.com/track/456"],
    ["deezer", "https://www.deezer.com/track/123/extra"],
    ["itunes", "https://music.apple.com/sg/album/in-rainbows/123"],
    ["itunes", "https://music.apple.com/sg/album/in-rainbows/456?i=789"],
    ["itunes", "https://music.apple.com/sg/album/in-rainbows/456?i=123&i=789"],
    ["itunes", "https://music.apple.com/sg/search?i=123"],
    ["itunes", "https://music.apple.com/sg/song/title/456"],
    ["itunes", "https://music.apple.com/sg/song/title/123?i=456"],
    ["itunes", "https://music.apple.com.evil.example/sg/song/title/123"],
    ["itunes", "https://www.deezer.com/track/123"],
  ]) {
    assert.equal(getListeningLinks({ ...track, provider, url })[0].kind, "search", url);
  }
});

test("search storefront uses only a two-letter country and cannot change the host", () => {
  const apple = (country) => getListeningLinks({ ...track, country }).find((link) => link.id === "apple-music");
  assert.match(apple("SG").url, /^https:\/\/music\.apple\.com\/sg\/search\?/);
  assert.match(apple("//evil.example").url, /^https:\/\/music\.apple\.com\/us\/search\?/);
});

test("deduplicates destinations and leaves the input unchanged", () => {
  const frozen = Object.freeze({ ...track });
  const before = JSON.stringify(frozen);
  const links = getListeningLinks(frozen);
  assert.equal(new Set(links.map((link) => link.id)).size, links.length);
  assert.equal(new Set(links.map((link) => link.url)).size, links.length);
  assert.equal(JSON.stringify(frozen), before);
});
