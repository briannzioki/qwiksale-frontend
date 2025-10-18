import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import RoleChip from "@/app/components/RoleChip";

describe("RoleChip (smoke)", () => {
  it("SUPERADMIN takes precedence over plan", () => {
    render(<RoleChip role="SUPERADMIN" subscription="PLATINUM" />);
    expect(screen.getByText("SUPERADMIN")).toBeInTheDocument();
    expect(screen.getByLabelText(/your role is superadmin/i)).toBeInTheDocument();
  });

  it("ADMIN replaces plan", () => {
    render(<RoleChip role="ADMIN" subscription="GOLD" />);
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
    expect(screen.getByLabelText(/your role is admin/i)).toBeInTheDocument();
  });

  it("non-admin falls back to plan", () => {
    render(<RoleChip role="USER" subscription="GOLD" />);
    expect(screen.getByText("GOLD")).toBeInTheDocument();
  });
});
