import { describe, expect, it } from "vitest";
import type { Change } from "../types";
import {
  build_path_index,
  normalize_changes_against_index,
  preserve_move_filename,
  resolve_move_destination_path,
} from "./folderPaths";

describe("resolve_move_destination_path", () => {
  const files = ["misc/photo.jpg", "downloads/readme.txt"];
  const file_index = build_path_index(files);
  const directories = ["downloads", "misc"];

  it("appends filename when to is an existing folder", () => {
    expect(
      resolve_move_destination_path("misc/photo.jpg", "downloads", file_index, directories),
    ).toBe("downloads/photo.jpg");
  });

  it("keeps explicit file destination", () => {
    expect(
      resolve_move_destination_path(
        "misc/photo.jpg",
        "downloads/vacation-photo.jpg",
        file_index,
        directories,
      ),
    ).toBe("downloads/vacation-photo.jpg");
  });
});

describe("preserve_move_filename", () => {
  it("replaces a proposed new basename with the source filename", () => {
    expect(preserve_move_filename("misc/photo.jpg", "downloads/vacation-photo.jpg")).toBe(
      "downloads/photo.jpg",
    );
  });
});

describe("normalize_changes_against_index", () => {
  it("normalizes moves and preserves filenames", () => {
    const index = build_path_index(["misc/photo.jpg"]);
    const { changes } = normalize_changes_against_index(
      [{ type: "move", from: "misc/photo.jpg", to: "photos/vacation.jpg" }],
      index,
      ["photos"],
    );
    expect(changes).toEqual([
      { type: "move", from: "misc/photo.jpg", to: "photos/photo.jpg" },
    ]);
  });

  it("treats legacy rename as move and preserves filenames", () => {
    const index = build_path_index(["misc/photo.jpg"]);
    const { changes } = normalize_changes_against_index(
      [
        {
          type: "rename",
          from: "misc/photo.jpg",
          to: "photos/vacation.jpg",
        } as unknown as Change,
      ],
      index,
      ["photos"],
    );
    expect(changes).toEqual([
      { type: "move", from: "misc/photo.jpg", to: "photos/photo.jpg" },
    ]);
  });
});
