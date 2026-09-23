import { describe, expect, it } from "vitest";
import { cmsFieldText } from "@/lib/meteoam-cms";

describe("cmsFieldText", () => {
  it("accepts bare strings and { value } wrappers", () => {
    expect(cmsFieldText("FBIY61 LIIB")).toBe("FBIY61 LIIB");
    expect(cmsFieldText({ value: "WAIY32 LIIB" })).toBe("WAIY32 LIIB");
    expect(cmsFieldText({ value: "  " })).toBeNull();
    expect(cmsFieldText(null)).toBeNull();
    expect(cmsFieldText(undefined)).toBeNull();
  });
});
