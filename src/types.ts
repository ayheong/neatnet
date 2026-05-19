export type TreeNode = {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  children?: TreeNode[];
};

export type ChangePreview = { id: string; from: string; to: string };

export type Change = {
  type: "rename" | "move" | "delete";
  from: string;
  to?: string;
};

export type OrganizeResult = {
  changes: Change[];
};
