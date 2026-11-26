import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVault = vi.hoisted(() => ({
  getUser: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  metadataError: null as { message: string } | null,
  uploadedPaths: [] as string[],
  removedPaths: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: mockVault.getUser },
    storage: {
      from: () => ({ upload: mockVault.upload, remove: mockVault.remove }),
    },
    from: mockVault.from,
  },
}));

import { updateVaultTextDocument, type VaultDocument } from "@/lib/vault";

const document: VaultDocument = {
  id: "document-1",
  name: "notes.txt",
  size: 6,
  type: "text/plain",
  uploadedAt: "2026-01-01T00:00:00.000Z",
  storagePath: "user-1/notes.txt",
};

describe("Vault text updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVault.metadataError = null;
    mockVault.uploadedPaths = [];
    mockVault.removedPaths = [];
    mockVault.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockVault.upload.mockImplementation(async (path: string) => {
      mockVault.uploadedPaths.push(path);
      return { error: null };
    });
    mockVault.remove.mockImplementation(async (paths: string[]) => {
      mockVault.removedPaths.push(...paths);
      return { error: null };
    });
    mockVault.from.mockImplementation(() => ({
      update: mockVault.update,
    }));
    mockVault.update.mockImplementation((values: { storage_path: string; size_bytes: number }) => ({
      eq: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: async () => ({
              data: mockVault.metadataError ? null : { id: "document-1" },
              error: mockVault.metadataError,
            }),
          }),
        }),
      }),
    }));
  });

  it("writes a new private object before switching metadata, then removes the prior object", async () => {
    const result = await updateVaultTextDocument(document, "updated text");

    expect(result.size).toBe(new Blob(["updated text"]).size);
    expect(result.storagePath).not.toBe(document.storagePath);
    expect(result.storagePath).toMatch(/^user-1\//);
    expect(mockVault.uploadedPaths).toEqual([result.storagePath]);
    expect(mockVault.removedPaths).toEqual([document.storagePath]);
    expect(mockVault.update).toHaveBeenCalledWith({
      storage_path: result.storagePath,
      size_bytes: result.size,
    });
  });

  it("keeps the original object and cleans up the new one if metadata cannot be updated", async () => {
    mockVault.metadataError = { message: "row update denied" };

    await expect(updateVaultTextDocument(document, "updated text")).rejects.toThrow(
      "Document metadata update failed: row update denied",
    );

    expect(mockVault.uploadedPaths).toHaveLength(1);
    expect(mockVault.removedPaths).toEqual(mockVault.uploadedPaths);
    expect(mockVault.removedPaths).not.toContain(document.storagePath);
  });
});
