import { describe, expect, it } from "vitest";
import {
  isLikelyImageUrl,
  resolveLinkUrl,
  resolveStillUrl,
  withCacheBust,
  type WebcamConfig,
} from "@/lib/webcams";

const cfg: WebcamConfig = {
  id: "test",
  odhId: "X",
  name: "Test",
  elevM: 100,
  group: "valley",
  stillFallback: "https://example.com/fallback.jpg",
  linkFallback: "https://example.com/live",
};

describe("webcams helpers", () => {
  it("detects image-like URLs", () => {
    expect(isLikelyImageUrl("https://x.com/a.jpg")).toBe(true);
    expect(isLikelyImageUrl("https://wtvthmb.feratel.com/thumbnails/1.jpeg?t=1")).toBe(
      true,
    );
    expect(isLikelyImageUrl("http://webtv.feratel.com/webtv/?cam=1")).toBe(false);
  });

  it("prefers ImageGallery still over webtv link", () => {
    const still = resolveStillUrl(
      {
        Webcamurl: "http://webtv.feratel.com/webtv/?cam=1",
        ImageGallery: [
          { ImageUrl: "http://wtvthmb.feratel.com/thumbnails/1.jpeg?t=38" },
        ],
      },
      cfg,
    );
    expect(still).toContain("thumbnails");
  });

  it("falls back to configured still", () => {
    expect(resolveStillUrl({ Webcamurl: "http://webtv.feratel.com/x" }, cfg)).toBe(
      cfg.stillFallback,
    );
  });

  it("resolves link-out and cache bust", () => {
    expect(
      resolveLinkUrl({ Webcamurl: "http://webtv.example/cam" }, cfg, null),
    ).toBe("http://webtv.example/cam");
    expect(withCacheBust("https://a.com/x.jpg", "2026-01-01T00:00:00Z")).toContain(
      "?t=2026-01-01",
    );
    expect(withCacheBust("https://a.com/x.jpg?v=1", "t")).toContain("&t=");
  });
});
