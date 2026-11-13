import { describe, expect, it } from "vitest"
import { normalizeProfileImageList, resolveProfileImageUrl } from "../utils/image-url.js"

describe("profile image URL normalization", () => {
  it.each([
    ["/profile/talentPics/a.jpg", "/profile/talentPics/a.jpg"],
    ["/prod-api/profile/talentPics/a.jpg", "/profile/talentPics/a.jpg"],
    ["/prod-api/profile/dkPic_zip/2026/08/13/a.jpg", "/profile/dkPic_zip/2026/08/13/a.jpg"],
    ["/upload/a.jpg", "/profile/upload/a.jpg"],
    ["upload/a.jpg", "/profile/upload/a.jpg"],
    ["https://cdn.example.test/a.jpg", "https://cdn.example.test/a.jpg"],
    ["", ""],
    [null, ""],
  ])("normalizes %j to %j", (value, expected) => {
    expect(resolveProfileImageUrl(value)).toBe(expected)
  })

  it("normalizes comma-separated and object attachment values", () => {
    expect(normalizeProfileImageList([
      "/prod-api/profile/a.jpg",
      { url: "/upload/b.jpg" },
      "",
    ])).toEqual([
      "/profile/a.jpg",
      "/profile/upload/b.jpg",
    ])
  })
})
